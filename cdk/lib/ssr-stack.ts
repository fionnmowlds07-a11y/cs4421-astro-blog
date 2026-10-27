import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { DOMAIN } from './domain-stack';
import { ImagesStack } from './images-stack';

export interface SsrStackProps extends cdk.StackProps {
  /** Which image in ECR to run, e.g. a commit ID or v2.0.0. */
  imageTag: string;
  // My domain's zone and wildcard certificate (DomainStack), for blog. and lb.fionnmowlds.online.
  zone: route53.IHostedZone;
  certificate: acm.ICertificate;
}

/** Runtime keys the container gets from Parameter Store (SecureString). Their values are never in the repo or image. */
export const RUNTIME_PARAMETERS = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'FOOTBALL_DATA_API_KEY'] as const;
export const PARAMETER_PREFIX = '/astro-blog/';

/**
 * The containerised SSR site: 2 copies of the image on ECS Fargate behind a load balancer that only sends visitors
 * to copies passing /api/health, with CloudFront in front, HTTPS all the way. Created by "infra-up" and deleted by
 * "infra-down", so it only costs money while a session is running.
 */
export class SsrStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: SsrStackProps) {
    super(scope, id, props);

    // A small network across 2 availability zones with public subnets only: no NAT gateway (~$32/month), so the
    // containers get public IPs to reach ECR, Supabase and the football API. Only the load balancer can reach them.
    const vpc = new ec2.Vpc(this, 'Network', {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [{ name: 'public', subnetType: ec2.SubnetType.PUBLIC }],
    });

    const cluster = new ecs.Cluster(this, 'Cluster', { vpc });

    // One JSON line per request from src/middleware.ts ends up here (searchable in CloudWatch Logs).
    const logGroup = new logs.LogGroup(this, 'SiteLogs', {
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskDefinition = new ecs.FargateTaskDefinition(this, 'SiteTask', {
      cpu: 256, // 0.25 vCPU
      memoryLimitMiB: 512,
      runtimePlatform: { cpuArchitecture: ecs.CpuArchitecture.X86_64, operatingSystemFamily: ecs.OperatingSystemFamily.LINUX },
    });

    const secrets = Object.fromEntries(
      RUNTIME_PARAMETERS.map((name) => [
        name,
        ecs.Secret.fromSsmParameter(
          ssm.StringParameter.fromSecureStringParameterAttributes(this, `Param${name}`, {
            parameterName: `${PARAMETER_PREFIX}${name}`,
          }),
        ),
      ]),
    );

    taskDefinition.addContainer('Site', {
      image: ecs.ContainerImage.fromEcrRepository(
        ecr.Repository.fromRepositoryName(this, 'SiteImages', ImagesStack.REPOSITORY_NAME),
        props.imageTag,
      ),
      portMappings: [{ containerPort: 4321 }],
      secrets,
      logging: ecs.LogDrivers.awsLogs({ logGroup, streamPrefix: 'site' }),
    });

    const service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition,
      desiredCount: 2, // two copies, so one crashing doesn't take the site down
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // Rolling update: start the new copies first (up to 200%), never drop below 100% healthy, so no downtime.
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
      // If a new version keeps failing, ECS puts the last working version back by itself.
      circuitBreaker: { enable: true, rollback: true },
      healthCheckGracePeriod: cdk.Duration.seconds(60),
    });

    const loadBalancer = new elbv2.ApplicationLoadBalancer(this, 'LoadBalancer', { vpc, internetFacing: true });
    // HTTPS with my wildcard certificate (as lb.fionnmowlds.online); plain HTTP is redirected to HTTPS.
    const listener = loadBalancer.addListener('Https', { port: 443, certificates: [props.certificate], open: true });
    loadBalancer.addRedirect({ sourcePort: 80, targetPort: 443 });
    const targetGroup = listener.addTargets('Site', {
      port: 4321,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [service],
      // Visitors only go to copies that answer /api/health with 200.
      healthCheck: {
        path: '/api/health',
        healthyHttpCodes: '200',
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 2,
      },
      deregistrationDelay: cdk.Duration.seconds(10), // old copies are let go quickly during a rollout
    });

    // Alarms (shown in CloudWatch → Alarms, no notifications). Both go off when 2 of the last 3 minutes are bad:
    // with my traffic even one 5xx is real, but a single blip shouldn't set them off.
    const alarmTiming = {
      evaluationPeriods: 3,
      datapointsToAlarm: 2,
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    };

    // Counts the app's own 5xx responses from the JSON log lines. defaultValue 0 means a quiet minute counts as
    // 0 errors instead of "no data".
    const serverErrors = new logs.MetricFilter(this, 'ServerErrorsFilter', {
      logGroup,
      filterPattern: logs.FilterPattern.numberValue('$.statusCode', '>=', 500),
      metricNamespace: 'AstroBlog',
      metricName: 'ServerErrors',
      metricValue: '1',
      defaultValue: 0,
    });
    new cloudwatch.Alarm(this, 'ServerErrorsAlarm', {
      alarmName: 'astro-blog-server-errors',
      alarmDescription: 'The site returned 5xx errors in 2 of the last 3 minutes. Check the log group, then roll back (runbook).',
      metric: serverErrors.metric({ statistic: cloudwatch.Stats.SUM, period: cdk.Duration.minutes(1) }),
      ...alarmTiming,
    });

    // A copy that crashes or fails /api/health may write no 5xx log line at all, so also watch the load balancer.
    new cloudwatch.Alarm(this, 'UnhealthyCopiesAlarm', {
      alarmName: 'astro-blog-unhealthy-copies',
      alarmDescription: 'A copy of the site failed its /api/health check in 2 of the last 3 minutes. Check ECS service events and the logs.',
      metric: targetGroup.metrics.unhealthyHostCount({ statistic: cloudwatch.Stats.MAXIMUM, period: cdk.Duration.minutes(1) }),
      ...alarmTiming,
    });

    // CloudFront talks to the load balancer over HTTPS as lb.fionnmowlds.online, so the Host header it sends must
    // be that name (the certificate can't cover dxxxx.cloudfront.net). This function passes the address the visitor
    // used along as X-Forwarded-Host instead, which Astro trusts for the domains in allowedDomains.
    const forwardHost = new cloudfront.Function(this, 'ForwardHostFunction', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  request.headers['x-forwarded-host'] = { value: request.headers.host.value };
  return request;
}
`),
    });

    // HTTPS in front of the load balancer (the login cookies are Secure, so they need HTTPS).
    // Caching follows the site's own Cache-Control headers; cookies, query strings and the other headers are passed
    // through, so forms, logins and Astro's origin check work.
    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(DOMAIN.loadBalancer, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.USE_ORIGIN_CACHE_CONTROL_HEADERS_QUERY_STRINGS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        functionAssociations: [{ function: forwardHost, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      domainNames: [DOMAIN.blog],
      certificate: props.certificate,
    });

    // blog. -> CloudFront (IPv4 and IPv6), lb. -> the load balancer. Deleted with the stack by Infra Down.
    const cdnTarget = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, 'BlogRecord', { zone: props.zone, recordName: DOMAIN.blog, target: cdnTarget });
    new route53.AaaaRecord(this, 'BlogRecordIpv6', { zone: props.zone, recordName: DOMAIN.blog, target: cdnTarget });
    const loadBalancerRecord = new route53.ARecord(this, 'LoadBalancerRecord', {
      zone: props.zone,
      recordName: DOMAIN.loadBalancer,
      target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(loadBalancer)),
    });
    // Create CloudFront only once lb. exists, so it never looks the name up too early and remembers it as missing.
    distribution.node.addDependency(loadBalancerRecord);

    // Printed by infra-up, so you always know this session's addresses and names (they change every session).
    new cdk.CfnOutput(this, 'SiteUrl', { description: 'The site on my domain (CloudFront)', value: `https://${DOMAIN.blog}` });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { description: 'The same site on its CloudFront address', value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'LoadBalancerUrl', { description: 'The load balancer directly (HTTPS)', value: `https://${DOMAIN.loadBalancer}` });
    new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new cdk.CfnOutput(this, 'ServiceName', { value: service.serviceName });
    new cdk.CfnOutput(this, 'LogGroupName', { value: logGroup.logGroupName });
  }
}
