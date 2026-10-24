import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';

/**
 * The ECR repository for the site's Docker images. It's its own stack because "infra-up" has to create it
 * and push an image into it before the SSR stack can start containers from that image. "infra-down" deletes
 * it again, images included, so every session starts clean (images don't survive between sessions).
 */
export class ImagesStack extends cdk.Stack {
  /** Must match the repository named in the GitHub OIDC role's ECR permissions. */
  static readonly REPOSITORY_NAME = 'astro-blog';

  readonly repository: ecr.Repository;

  constructor(scope: cdk.App, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    this.repository = new ecr.Repository(this, 'SiteImages', {
      repositoryName: ImagesStack.REPOSITORY_NAME,
      imageScanOnPush: true, // checks every pushed image for known vulnerabilities
      // Image labels (the commit ID, v2.0.0, ...) can't be moved to a different image once pushed,
      // so "roll back to v2.0.0" always means exactly the image that was released as v2.0.0.
      imageTagMutability: ecr.TagMutability.IMMUTABLE,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      emptyOnDelete: true, // "infra-down" deletes the images too
    });

    new cdk.CfnOutput(this, 'RepositoryUri', {
      description: 'Where infra-up pushes the site image',
      value: this.repository.repositoryUri,
    });
  }
}
