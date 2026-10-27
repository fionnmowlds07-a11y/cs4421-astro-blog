
import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import { DOMAIN } from './domain-stack';

export interface StaticSiteStackProps extends cdk.StackProps {
  // Directory uploaded to the bucket; overridable so tests don't need a site build.
  siteAssetPath?: string;
  // My domain's zone and wildcard certificate (DomainStack), for static.fionnmowlds.website.
  zone: route53.IHostedZone;
  certificate: acm.ICertificate;
}

export class StaticSiteStack extends cdk.Stack {
  constructor(scope: cdk.App, id: string, props: StaticSiteStackProps) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      // Private bucket: only CloudFront reads it (via OAC), and only over HTTPS
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    // Astro emits /about/index.html; CloudFront only resolves index.html for "/",
    // so rewrite directory-style URLs to their index.html object.
    const rewriteFunction = new cloudfront.Function(this, 'IndexRewriteFunction', {
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri += 'index.html';
  } else if (!uri.split('/').pop().includes('.')) {
    request.uri += '/index.html';
  }
  return request;
}
`),
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        functionAssociations: [
          {
            function: rewriteFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
      defaultRootObject: 'index.html',
      domainNames: [DOMAIN.static],
      certificate: props.certificate,
    });

    // static.fionnmowlds.website -> this CloudFront distribution (IPv4 and IPv6)
    const target = route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, 'SiteRecord', { zone: props.zone, recordName: DOMAIN.static, target });
    new route53.AaaaRecord(this, 'SiteRecordIpv6', { zone: props.zone, recordName: DOMAIN.static, target });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(props.siteAssetPath ?? '../dist')],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'], // Automatic CloudFront CDN cache invalidation!
    });

    // Printed at the end of `cdk deploy` (and saved by the workflow), so the site's addresses are easy to find.
    new cdk.CfnOutput(this, 'SiteUrl', {
      description: 'Public HTTPS address of the static site (my domain)',
      value: `https://${DOMAIN.static}`,
    });
    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      description: 'The same site on its CloudFront address',
      value: `https://${distribution.distributionDomainName}`,
    });
  }
}
