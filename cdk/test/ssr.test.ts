import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { SsrStack } from '../lib/ssr-stack';

const template = Template.fromStack(new SsrStack(new cdk.App(), 'TestSsr', { imageTag: 'v2.0.0' }));

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

test('CloudFront redirects to HTTPS and passes cookies, query strings and the Host header through', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({
        ViewerProtocolPolicy: 'redirect-to-https',
        AllowedMethods: Match.arrayWith(['POST']),
        OriginRequestPolicyId: '216adef6-5c7f-47e4-b989-5492eafa07d3', // AWS managed "AllViewer"
      }),
    }),
  });
});

test('prints the addresses and names infra-up and the runbook need', () => {
  for (const output of ['SiteUrl', 'LoadBalancerUrl', 'ClusterName', 'ServiceName', 'LogGroupName']) template.hasOutput(output, {});
});
