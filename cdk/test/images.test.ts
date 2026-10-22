import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { ImagesStack } from '../lib/images-stack';

const template = Template.fromStack(new ImagesStack(new cdk.App(), 'TestImages'));

test('repository has the name the GitHub OIDC role is allowed to push to', () => {
  template.hasResourceProperties('AWS::ECR::Repository', { RepositoryName: 'astro-blog' });
});

test('every pushed image is scanned for vulnerabilities', () => {
  template.hasResourceProperties('AWS::ECR::Repository', {
    ImageScanningConfiguration: { ScanOnPush: true },
  });
});

test('image labels cannot be moved to another image', () => {
  template.hasResourceProperties('AWS::ECR::Repository', { ImageTagMutability: 'IMMUTABLE' });
});

test('infra-down deletes the repository and its images', () => {
  template.hasResource('AWS::ECR::Repository', { DeletionPolicy: 'Delete' });
  template.hasResourceProperties('AWS::ECR::Repository', { EmptyOnDelete: true });
});
