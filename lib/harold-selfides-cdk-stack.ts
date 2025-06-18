//Harold Sefides
//Serverless Feedback API with AWS CDK
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as path from 'path';

export class HaroldSelfidesCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // 1. DynamoDB Table
    const selfidesTable = new dynamodb.Table(this, 'HaroldSelfidesTable', {
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      tableName: process.env.DYNAMODB_TABLE || 'HaroldSelfidesTable',
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // 2. Cognito User Pool and Client
    const userPool = new cognito.UserPool(this, 'HaroldUserPoolLatest', {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      userPoolName: 'HaroldUserPoolLatest',
    });

    const userPoolClient = new cognito.UserPoolClient(this, 'HaroldUserPoolClient', {
      userPool,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      generateSecret: false, // Important for frontend applications
    });

    // 3. Lambda Authorizer Function
    const authorizerFn = new lambdaNodejs.NodejsFunction(this, 'AuthorizerFn', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../lambda/authorizer.ts'),
      handler: 'handler',
      environment: {
        COGNITO_REGION: this.region,
        COGNITO_USER_POOL_ID: userPool.userPoolId,
      },
    });

    const lambdaAuthorizer = new apigateway.TokenAuthorizer(this, 'LambdaAuthorizer', {
      handler: authorizerFn,
    });

    // 4. Feedback Lambda Function
    const feedbackLambda = new lambdaNodejs.NodejsFunction(this, 'FeedbackHandler', {
      runtime: lambda.Runtime.NODEJS_18_X,
      entry: path.join(__dirname, '../lambda/handler.ts'),
      handler: 'handler',
      environment: {
        DYNAMODB_TABLE: selfidesTable.tableName,
        AES_SECRET_KEY: process.env.AES_SECRET_KEY || 'default_secret_key',
      },
    });

    selfidesTable.grantReadWriteData(feedbackLambda);

    // 5. API Gateway with CORS
    const api = new apigateway.RestApi(this, 'FeedbackApi', {
      restApiName: 'Product Feedback Service',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const feedback = api.root.addResource('feedback');

    feedback.addMethod('POST', new apigateway.LambdaIntegration(feedbackLambda), {
      authorizer: lambdaAuthorizer, 
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    feedback.addMethod('GET', new apigateway.LambdaIntegration(feedbackLambda), {
      authorizer: lambdaAuthorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    feedback.addMethod('DELETE', new apigateway.LambdaIntegration(feedbackLambda), {
      authorizer: lambdaAuthorizer,
      authorizationType: apigateway.AuthorizationType.CUSTOM,
    });

    // 6. Outputs
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: userPool.userPoolId,
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: userPoolClient.userPoolClientId,
    });

    new cdk.CfnOutput(this, 'API URL', {
      value: api.url ?? 'Something went wrong with the API Gateway setup',
    });

    new cdk.CfnOutput(this, 'Region', {
      value: this.region,
    });
  }
}