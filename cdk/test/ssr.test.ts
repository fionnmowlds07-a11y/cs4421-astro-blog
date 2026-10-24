import { Match, Template } from 'aws-cdk-lib/assertions';
import { SsrStack } from '../lib/ssr-stack';
import { appWithDomain, TEST_ENV } from './test-domain';

const { app, domain } = appWithDomain();
const template = Template.fromStack(
  new SsrStack(app, 'TestSsr', { env: TEST_ENV, imageTag: 'v2.0.0', zone: domain.zone, certificate: domain.certificate }),
);

test('no NAT gateway (it would cost ~$32 a month)', () => {
  template.resourceCountIs('AWS::EC2::NatGateway', 0);
});

test('runs 2 copies with zero-downtime rolling updates and automatic rollback', () => {
  template.hasResourceProperties('AWS::ECS::Service', {
    DesiredCount: 2,
    LaunchType: 'FARGATE',
    DeploymentConfiguration: {
      MinimumHealthyPercent: 100,
      MaximumPercent: 200,
      DeploymentCircuitBreaker: { Enable: true, Rollback: true },
    },
  });
});

test('runs the chosen image from the astro-blog ECR repository', () => {
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [
      Match.objectLike({
        Image: Match.objectLike({ 'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp('/astro-blog:v2.0.0$')])]) }),
        PortMappings: [Match.objectLike({ ContainerPort: 4321 })],
      }),
    ],
  });
});

test('runtime keys come from Parameter Store, never from the image or repo', () => {
  template.hasResourceProperties('AWS::ECS::TaskDefinition', {
    ContainerDefinitions: [
      Match.objectLike({
        Secrets: Match.arrayWith([
          Match.objectLike({ Name: 'SUPABASE_URL' }),
          Match.objectLike({ Name: 'SUPABASE_PUBLISHABLE_KEY' }),
          Match.objectLike({ Name: 'FOOTBALL_DATA_API_KEY' }),
        ]),
      }),
    ],
  });
  const containers = Object.values(template.findResources('AWS::ECS::TaskDefinition'))[0].Properties.ContainerDefinitions;
  expect(containers[0].Environment ?? []).toEqual([]);
});

test('load balancer only sends visitors to copies passing /api/health', () => {
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
    HealthCheckPath: '/api/health',
    Matcher: { HttpCode: '200' },
    Port: 4321,
  });
});

test('container logs go to a CloudWatch log group that is deleted with the stack', () => {
  template.hasResourceProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
  template.hasResource('AWS::Logs::LogGroup', { DeletionPolicy: 'Delete' });
});

test('CloudFront redirects to HTTPS and passes cookies, query strings and headers (except Host) through', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: Match.arrayWith(['POST']),
        OriginRequestPolicyId: 'b689b0a8-53d0-40ab-baf2-68738e2966ac', // AWS managed "AllViewerExceptHostHeader"
        FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
      }),
    }),
  });
});

test('CloudFront answers on blog.fionnmowlds.online and talks to the load balancer over HTTPS as lb.', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      Aliases: ['blog.fionnmowlds.online'],
      Origins: [
        Match.objectLike({
          DomainName: 'lb.fionnmowlds.online',
          CustomOriginConfig: Match.objectLike({ OriginProtocolPolicy: 'https-only' }),
        }),
      ],
    }),
  });
});

test('the visitor\'s address reaches Astro as X-Forwarded-Host', () => {
  template.hasResourceProperties('AWS::CloudFront::Function', {
    FunctionCode: Match.stringLikeRegexp("x-forwarded-host'\\] = \\{ value: request.headers.host.value \\}"),
  });
});

test('the load balancer serves HTTPS with my certificate and redirects HTTP to HTTPS', () => {
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 443,
    Protocol: 'HTTPS',
    Certificates: [Match.objectLike({ CertificateArn: Match.anyValue() })],
  });
  template.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
    Port: 80,
    DefaultActions: [Match.objectLike({ Type: 'redirect', RedirectConfig: Match.objectLike({ Port: '443', Protocol: 'HTTPS' }) })],
  });
});

test('blog. and lb. records point at CloudFront and the load balancer', () => {
  for (const type of ['A', 'AAAA']) {
    template.hasResourceProperties('AWS::Route53::RecordSet', { Name: 'blog.fionnmowlds.online.', Type: type, HostedZoneId: 'Z0TESTZONE' });
  }
  template.hasResourceProperties('AWS::Route53::RecordSet', { Name: 'lb.fionnmowlds.online.', Type: 'A', HostedZoneId: 'Z0TESTZONE' });
});

test('prints the addresses and names infra-up and the runbook need', () => {
  template.hasOutput('SiteUrl', { Value: 'https://blog.fionnmowlds.online' });
  template.hasOutput('LoadBalancerUrl', { Value: 'https://lb.fionnmowlds.online' });
  for (const output of ['CloudFrontUrl', 'ClusterName', 'ServiceName', 'LogGroupName']) template.hasOutput(output, {});
});
