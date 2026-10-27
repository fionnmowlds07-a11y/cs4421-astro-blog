import * as cdk from 'aws-cdk-lib';
import { DomainStack } from '../lib/domain-stack';

/** The account and region the test stacks pretend to be in (the zone lookup needs both). */
export const TEST_ENV = { account: '123456789012', region: 'us-east-1' };

/**
 * An app whose Route 53 lookup is answered from context instead of AWS, plus the domain stack, so the stacks that
 * use my domain can be tested without credentials.
 */
export function appWithDomain() {
  const app = new cdk.App({
    context: {
      'hosted-zone:account=123456789012:domainName=fionnmowlds.website:region=us-east-1': {
        Id: '/hostedzone/Z0TESTZONE',
        Name: 'fionnmowlds.website.',
      },
    },
  });
  const domain = new DomainStack(app, 'TestDomain', { env: TEST_ENV });
  return { app, domain };
}
