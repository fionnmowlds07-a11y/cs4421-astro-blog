import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { ImagesStack } from './images-stack';

export interface SsrStackProps extends cdk.StackProps {
  /** Which image in ECR to run, e.g. a commit ID or v2.0.0. */
  imageTag: string;
}

/** Runtime keys the container gets from Parameter Store (SecureString). Their values are never in the repo or image. */
export const RUNTIME_PARAMETERS = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'FOOTBALL_DATA_API_KEY'] as const;
export const PARAMETER_PREFIX = '/astro-blog/';

/**
 * The containerised SSR site: 2 copies of the image on ECS Fargate behind a load balancer that only sends visitors
 * to copies passing /api/health, with CloudFront in front for HTTPS. Created by "infra-up" and deleted by
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
    const listener = loadBalancer.addListener('Http', { port: 80, open: true });
    listener.addTargets('Site', {
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

    // HTTPS in front of the load balancer (the login cookies are Secure, so they need HTTPS).
    // Caching follows the site's own Cache-Control headers; ALL_VIEWER passes cookies, query strings and the Host
    // header through, so forms, logins and Astro's origin check see the CloudFront address.
    const distribution = new cloudfront.Distribution(this, 'Cdn', {
      defaultBehavior: {
        origin: new origins.HttpOrigin(loadBalancer.loadBalancerDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.USE_ORIGIN_CACHE_CONTROL_HEADERS_QUERY_STRINGS,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER,
      },
    });

    // Printed by infra-up, so you always know this session's addresses and names (they change every session).
    new cdk.CfnOutput(this, 'SiteUrl', { description: 'HTTPS address (CloudFront)', value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'LoadBalancerUrl', { description: 'Load balancer address (HTTP only)', value: `http://${loadBalancer.loadBalancerDnsName}` });
    new cdk.CfnOutput(this, 'ClusterName', { value: cluster.clusterName });
    new cdk.CfnOutput(this, 'ServiceName', { value: service.serviceName });
    new cdk.CfnOutput(this, 'LogGroupName', { value: logGroup.logGroupName });
  }
}
