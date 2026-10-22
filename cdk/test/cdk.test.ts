import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { StaticSiteStack } from '../lib/cdk-stack';

let template: Template;
let siteDir: string;

beforeAll(() => {
  // Stand-in for the Astro build output so the stack synthesizes without `npm run build`
  siteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'site-'));
  fs.writeFileSync(path.join(siteDir, 'index.html'), '<h1>test</h1>');

  const app = new cdk.App();
  const stack = new StaticSiteStack(app, 'TestStack', { siteAssetPath: siteDir });
  template = Template.fromStack(stack);
});

afterAll(() => {
  fs.rmSync(siteDir, { recursive: true, force: true });
});

test('site bucket blocks all public access', () => {
  template.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: {
      BlockPublicAcls: true,
      BlockPublicPolicy: true,
      IgnorePublicAcls: true,
      RestrictPublicBuckets: true,
    },
  });
});

test('site bucket rejects non-HTTPS requests', () => {
  template.hasResourceProperties('AWS::S3::BucketPolicy', {
    PolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
          Effect: 'Deny',
          Condition: { Bool: { 'aws:SecureTransport': 'false' } },
        }),
      ]),
    }),
  });
});

test('CloudFront reads the bucket through Origin Access Control', () => {
  template.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      Origins: [Match.objectLike({ OriginAccessControlId: Match.anyValue() })],
    }),
  });
});

test('distribution serves index.html at the root', () => {
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({ DefaultRootObject: 'index.html' }),
  });
});

test('index rewrite function runs on viewer requests', () => {
  template.resourceCountIs('AWS::CloudFront::Function', 1);
  template.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: Match.objectLike({
      DefaultCacheBehavior: Match.objectLike({
        FunctionAssociations: [Match.objectLike({ EventType: 'viewer-request' })],
      }),
    }),
  });
});

test('deployment invalidates the whole CloudFront cache', () => {
  template.hasResourceProperties('Custom::CDKBucketDeployment', {
    DistributionPaths: ['/*'],
  });
});

test('stack outputs the HTTPS address of the site', () => {
  template.hasOutput('SiteUrl', {
    Value: { 'Fn::Join': ['', ['https://', { 'Fn::GetAtt': [Match.stringLikeRegexp('SiteDistribution'), 'DomainName'] }]] },
  });
});
