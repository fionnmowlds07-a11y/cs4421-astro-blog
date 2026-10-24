#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { StaticSiteStack } from '../lib/cdk-stack';
import { ImagesStack } from '../lib/images-stack';
import { SsrStack } from '../lib/ssr-stack';

const app = new cdk.App();
new StaticSiteStack(app, 'StaticSiteStack', {
  // The built static site to upload. The deploy workflow builds a static release (e.g. the v1.0.0 tag)
  // in its own folder and points STATIC_SITE_DIR at it; otherwise it's this repo's ../dist.
  siteAssetPath: process.env.STATIC_SITE_DIR,
  /* If you don't specify 'env', this stack will be environment-agnostic.
   * Account/Region-dependent features and context lookups will not work,
   * but a single synthesized template can be deployed anywhere. */

  /* Uncomment the next line to specialize this stack for the AWS Account
   * and Region that are implied by the current CLI configuration. */
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },

  /* Uncomment the next line if you know exactly what Account and Region you
   * want to deploy the stack to. */
  // env: { account: '123456789012', region: 'us-east-1' },

  /* For more information, see https://docs.aws.amazon.com/cdk/latest/guide/environments.html */
});

// The SSR site's Docker images (ECR). Created and deleted together with the SSR environment by infra-up/infra-down.
new ImagesStack(app, 'AstroBlogImages', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
});

// The containerised SSR site. infra-up passes the image to run with `-c imageTag=<commit ID or vX.Y.Z>`.
new SsrStack(app, 'AstroBlogSsr', {
  env: { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'us-east-1' },
  imageTag: app.node.tryGetContext('imageTag') ?? 'latest',
});
