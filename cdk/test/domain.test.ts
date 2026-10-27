import { Template } from 'aws-cdk-lib/assertions';
import { appWithDomain } from './test-domain';

const template = Template.fromStack(appWithDomain().domain);

test('one wildcard certificate covers blog., lb., static. and the domain itself', () => {
  template.resourceCountIs('AWS::CertificateManager::Certificate', 1);
  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    DomainName: '*.fionnmowlds.website',
    SubjectAlternativeNames: ['fionnmowlds.website'],
    ValidationMethod: 'DNS',
  });
});

test('the certificate is checked through my existing Route 53 zone, which is never created or deleted here', () => {
  template.hasResourceProperties('AWS::CertificateManager::Certificate', {
    // One DNS record proves both names, so CDK only lists the domain itself.
    DomainValidationOptions: [{ DomainName: 'fionnmowlds.website', HostedZoneId: 'Z0TESTZONE' }],
  });
  template.resourceCountIs('AWS::Route53::HostedZone', 0);
});
