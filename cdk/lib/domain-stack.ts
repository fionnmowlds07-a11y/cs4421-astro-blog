import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';

/** My domain (bought at GoDaddy, DNS in Route 53) and the addresses used on it. */
export const DOMAIN = {
  name: 'fionnmowlds.website',
  blog: 'blog.fionnmowlds.website', // the SSR site, through CloudFront
  loadBalancer: 'lb.fionnmowlds.website', // the SSR site's load balancer, directly
  static: 'static.fionnmowlds.website', // the static v1.0.0 site
} as const;

/**
 * The parts of my domain that stay up permanently: the Route 53 zone (created by hand once, so its nameservers
 * at GoDaddy never change) and one free wildcard certificate for all the addresses. Infra Down never deletes
 * this stack, so AWS only has to check I own the domain once, instead of on every Infra Up.
 */
export class DomainStack extends cdk.Stack {
  readonly zone: route53.IHostedZone;
  readonly certificate: acm.ICertificate;

  constructor(scope: cdk.App, id: string, props: cdk.StackProps) {
    super(scope, id, props);

    this.zone = route53.HostedZone.fromLookup(this, 'Zone', { domainName: DOMAIN.name });

    // CloudFront only accepts certificates from us-east-1, which is where everything runs anyway.
    this.certificate = new acm.Certificate(this, 'Certificate', {
      domainName: `*.${DOMAIN.name}`,
      subjectAlternativeNames: [DOMAIN.name],
      validation: acm.CertificateValidation.fromDns(this.zone), // CDK adds the DNS record that proves I own it
    });
  }
}
