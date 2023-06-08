# Introduction

To have the function run successfully, and to have the workflow be able to create several AWS resources, there is admin work that needs to be done and done manually (for now). The following chapters describe what to do to setup and configure necessary infrastructure. This would be done, usually, by an admin.

# Create Github App

First, think about a sattic Webhook URL that you want to use. Assuming you have a domain like `my.domain.com`, and assuming you want to receive Github webhook events on `webhook` subdomain, the full record (A type record - created for you by AWS SAM) would be `webhook.my.domain.com`. The backend that runs behind the Lambda function, will be exposed on the path `/ghrunner-app`. And, later on you will create a TLS certificate, which implies that `https` protocol will be used. End result for the full static Webhook URL will be `https://webhook.my.domain.com/ghrunner-app`. Think about this URL first, because now you will create and configure your Github app. Later on, you will run a workflow that creates several AWS resources, and deployes the function. But first create your Github App:
- open the settings page of your profile in Github
- then go to Developer Settings > Github Apps
- hit the "New Github App" button
- give your app a name
- give your app a homepage, it can be whatever you want
- scroll down to section **Wehbook**
- set the **Webhook URL** to the URL you want to use as a static URL (eg: `https://webhook.my.domain.com/ghrunner-app`)
- set your **Webhook secret** and save it, you will need it later
- scroll to **Repository Permissions**
- set **Actions** permission to **Read and write**
- set **Administration** permission to **Read and write**
- scroll down to **Subscribe to events** and subscribe to **Workflow job** and **Workflow run** events
- leave the **Only on this account** option set, usually it won't change
- hit the **Create GitHub App** button
- once the app is created save the **App ID**, you will need it
- scroll down to **Private keys** and hit the **Generate a private key** button
- save the `.pem` file to your filesystem and rename it to `ghapp.pem`.

Now the app needs to be installed. To do that open the **Install App** page. Select your account and hit the **Install** button. Choose one of the two options provided. Either install the app on **All repositories**, or choose the **Only selected repositories**. If you choose the **Only selected repositories**, search for the repository / repositories for which you want to install the app.

Now the app is configured and installed. 

# R53 domain setup and certificate

In order to be able to use a static webhook url, first we need a R53 hosted zone id. If a hosted zone does not exist, create one. Save the hosted zone id. Id will be set as environment variable later.

After a hosted zone id is obtained, create a TLS certificate with AWS Certificate Manager. Try to use catch-all domain as domain name (like `*.my.domain.com`). Save the certificate ARN. ARN will be set as environment variable later.

Once the certificate is created, make sure to create required R53 records necessary for the certificate to work. Use the "Create records in Route 53" button in certificate details page.

Note: after this step, this would be the list of environment variables that you would set up later:
```
HOSTED_ZONE_ID=<zone id>
FULL_DOMAIN_NAME=<example: webhook.my.domain.com>
TLS_CERTIFICATE_ARN=<certificate arn>
```
# S3 buckets

You will need two S3 buckets. One bucket to store AWS SAM artifacts, and another for Pulumi artifacts. Both of these will be set as environment variables later. 

Note: make sure that all public access to the bucket is disabled. After this step, this would be the list of environment variables that you would set up later: 
```
# previously added
HOSTED_ZONE_ID=<zone id>
FULL_DOMAIN_NAME=<example: webhook.my.domain.com>
TLS_CERTIFICATE_ARN=<certificate arn>

# added now
AWS_S3_BUCKET=<account>.<region>.sam.artifacts
PULUMI_BACKEND_URL=s3://<account>.<region>.pulumi.artifacts
```
Note: because of the fact that one bucket is used by AWS SAM and the other is used by Pulumi, the later bucket needs to be prefixed with the protocol.

# AWS Secrets

There are 4 secrets that need to be created with Secrets Manager. So open Secrets Manager, and create:
- name: appId, type: plaintext - set the id of the github app
- name: privateKey, type: plaintext - set the `ghapp.pem` signature
- name: webhookSecret, type: plaintext - set the secret you will use for the github app webhook. Value can be arbitrary, but needs to match what is configure in the chapter [Create Github App](#create-github-app)
- name: pulumiPassphrase, type: plaintext - set the secret that Pulumi will use to run successfuly. Value can be arbitrary

# AWS ECR repository

In order for the backend to work, it needs several tools installed, as well as an appropriate runtime. Which is why the project is built with Docker. Each time workflow runs, it will try to build a Docker image, and push it to an AWS ECR repository. Create an ECR repo called `ghrunner-app`. Save the ECR repo URI, it will be exposed as an environment variable.

Note: after this step, this would be the list of environment variables that you would set up later:
```
# previously added
HOSTED_ZONE_ID=<zone id>
FULL_DOMAIN_NAME=<example: webhook.my.domain.com>
TLS_CERTIFICATE_ARN=<certificate arn>
AWS_S3_BUCKET=<s3 bucket name for AWS SAM templates, example: my-account.us-east-1.sam.templates>
PULUMI_BACKEND_URL=s3://<my-account.us-east-1.pulumi.state>

# added now
ECR_REPO=<account-id>.dkr.ecr.<aws-region>.amazonaws.com
```

Note: the repo name `ghrunner-app` will be appended automatically by the [Makefile](Makefile).

# IAM resources
To make the application able to run properly, several IAM resources need to be created.

First create an IAM policy, but replace the placeholders in the json example, with a bucket ARN created above (the bucket for AWS SAM templates) and hosted zone id. Pay attention to the asterisk, don't remove it:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "route53:GetChange",
                "apigateway:*",
                "route53:GetHostedZone",
                "route53:ChangeResourceRecordSets"
            ],
            "Resource": [
                "arn:aws:apigateway:*::/*",
                "arn:aws:route53:::change/*",
                "arn:aws:route53:::hostedzone/<hosted zone id>"
            ]
        },
        {
            "Effect": "Allow",
            "Action": "iam:PassRole",
            "Resource": "*",
            "Condition": {
                "StringEquals": {
                    "iam:PassedToService": "lambda.amazonaws.com"
                }
            }
        },
        {
            "Effect": "Allow",
            "Action": [
                "lambda:CreateFunction",
                "lambda:TagResource",
                "lambda:GetFunction",
                "lambda:UpdateFunctionConfiguration",
                "ecr:GetAuthorizationToken",
                "ecr:UploadLayerPart",
                "lambda:GetFunctionCodeSigningConfig",
                "ecr:PutImage",
                "lambda:UpdateFunctionCode",
                "lambda:AddPermission",
                "lambda:ListTags",
                "ecr:CompleteLayerUpload",
                "lambda:DeleteFunction",
                "ecr:InitiateLayerUpload",
                "ecr:BatchCheckLayerAvailability",
                "cloudformation:ListStackResources",
                "cloudformation:CreateChangeSet",
                "cloudformation:DescribeStacks",
                "cloudformation:DescribeChangeSet"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": "s3:*",
            "Resource": "<s3 bucket arn>*"
        }
    ]
}
```
Give the policy a name, and optionaly add tags.

Next create a new IAM user. Attach the policy created above to this user. Generate a set of access keys for this user, these need to be stored as secrets in github. Those would be `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.

Next, create one more policy. This policy will be used by Pulumi programmatically. Replace the placeholder with the second bucket ARN, used to store Pulumi state files. Pay attention to the asterisk, don't remove it:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowAllS3ActionsOnGrOssPulumiBuckets",
            "Effect": "Allow",
            "Action": "s3:*",
            "Resource": "<pulumi s3 bucket arn>*"
        },
        {
            "Sid": "AllowAllEC2Actions",
            "Effect": "Allow",
            "Action": "ec2:*",
            "Resource": "*"
        }
    ]
}
```
Give the policy a name, and optionaly add tags.

Next, create an IAM role. Choose trusted entity type AWS Service, and for common use cases set "Lambda". Attach policies:
 - SecretsManagerReadWrite
 - AWSLambdaBasicExecutionRole
 - and the pulumi policy created above

Save the role ARN, it will be needed for later. It will be set as environment variable `AWS_ARN_ROLE`.

summary: after this step, these would be the list of environment variables that you would set up at the end
```
# previously added
HOSTED_ZONE_ID=<zone id>
FULL_DOMAIN_NAME=<example: webhook.my.domain.com>
TLS_CERTIFICATE_ARN=<certificate arn>
AWS_S3_BUCKET=<s3 bucket name for AWS SAM templates, example: my-account.us-east-1.sam.templates>
PULUMI_BACKEND_URL=s3://<my-account.us-east-1.pulumi.state>
ECR_REPO=<account-id>.dkr.ecr.<aws-region>.amazonaws.com

# added now
AWS_ARN_ROLE=<aws role arn>
AWS_ACCESS_KEY_ID=<aws access key id for the user created above>
AWS_SECRET_ACCESS_KEY=<aws access key id for the user created above>
AWS_REGION=<your default aws region>
```

# Additional environment variables

Lastly, one more environment variable needs to be set up, and those are:
```
JOB_FILTER=<job-label-that-will-trigger-runners-provissioning>
```
Let's explain the `JOB_FILTER`. This is a keyword, or label, of a job that you want to run on self-hosted runners. Basically, a job has a name in your Github Actions workflow YAML file. Also, job needs to be configured with `runs-on` property set to `self-hosted`, when you want to run the job on self hosted runners. Take the name of the job, or part of the name, and set `JOB_FILTER` using that.

summary: after this step, these would be the list of environment variables that you would set up at the end
```
# previously added
HOSTED_ZONE_ID=<zone id>
FULL_DOMAIN_NAME=<example: webhook.my.domain.com>
TLS_CERTIFICATE_ARN=<certificate arn>
AWS_S3_BUCKET=<s3 bucket name for AWS SAM templates, example: my-account.us-east-1.sam.templates>
PULUMI_BACKEND_URL=s3://<my-account.us-east-1.pulumi.state>
ECR_REPO=<account-id>.dkr.ecr.<aws-region>.amazonaws.com
AWS_ARN_ROLE=<aws role arn>
AWS_ACCESS_KEY_ID=<aws access key id for the user created above>
AWS_SECRET_ACCESS_KEY=<aws access key id for the user created above>
AWS_REGION=<your default aws region>

# added now
JOB_FILTER=<job-label-that-will-trigger-runners-provisioning>
```

# Configure ghrunner-app repository
Deployment workflow runs through an environment. So head to the repository settings, and create an environment called `protected`. Then create a selected branches protection rule and set the default branch as a rule (main/master). After that, add secrets:

- HOSTED_ZONE_ID: `<ID of the R53 hosted zone to which additional R53 records will be added, together with the Webhook R53 record>`
- FULL_DOMAIN_NAME: `<R53 record name that will be used for webhooks, eg: webhook.my.domain.com>`
- TLS_CERTIFICATE_ARN: `<ARN of the TLS certificate issued for your webhooks R53 domain>`
- AWS_S3_BUCKET: `<only the name of the bucket created above, not an arn>`
- PULUMI_BACKEND_URL: `s3://<name of an S3 bucket that will store pulumi state files>`
- ECR_REPO: `<account-id>.dkr.ecr.<aws-region>.amazonaws.com`
- AWS_ARN_ROLE: `<arn of the role created above>`
- AWS_ACCESS_KEY_ID: `<aws access key id from user created above>`
- AWS_SECRET_ACCESS_KEY: `<aws secret access key from user created above>`
- AWS_REGION: `<aws region used to create resources above>`
- JOB_FILTER: `<taken from the jobs labels, to filter for which jobs runner will be created>`

# Next and final steps
1. Enable Github Actions by going to the Actions page and following the steps described
2. Select the AWS SAM workflow
3. Hit the "Run workflow" button, select your main/master branch and run the workflow
4. After deployment is done, login to AWS, and find the Lambda function
5. Verify that the function exists and runs