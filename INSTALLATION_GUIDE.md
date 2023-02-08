# Create Github App

To create Github App:
- open the settings page of your profile in Github
- then go to Developer Settings > Github Apps
- hit the "New Github App" button
- give your app a name
- give your app a homepage, it can be whatever you want
- scroll down to section **Wehbook**
- set the **Webhook URL** to whatever, but we will come back to this later
- scroll to **Repository Permissions**
- set **Actions** permission to **Read and write**
- scroll down to **Subscribe to events** and subscribe to **Workflow job** and **Workflow run** events
- leave the **Only on this account** option set, usually it won't change
- hit the **Create GitHub App** button
- once the app is created save the **App ID**, you will need it
- scroll down to **Private keys** and hit the **Generate a private key** button
- save the `.pem` file to your filesystem and rename it to `ghapp.pem`.


Now the app needs to be installed. To do that open the **Install App** page. Select your account and hit the **Install** button. Choose one of the two options provided. Either install the app on **All repositories**, all choose the **Only selected repositories**. If you choose the **Only selected repositories**, search for the repository / repositories for which you want to install the app.


Now the app is configured and installed.
# Create AWS resources
## Create S3 bucket
This bucket is used to store AWS SAM templates. Bucket needs to be created in a specific region, choose the one you need. However, the bucket name needs to be unique globally, across all regions. Suggestion is to use this format:

```
<account>.<region>.sam-templates
```
Additionaly, close the bucket for public access, and optionaly necessary tags.

## Create IAM resources
To make the application able to run properly, several IAM resources need to be created.

First create an IAM policy, but replace the placeholder in the json example, with a bucket ARN created above. Pay attention to the asterisk, don't remove it:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "AllowAllS3ActionsOnGrOssSAMBucket",
            "Effect": "Allow",
            "Action": "s3:*",
            "Resource": "<s3_bucket_arn>*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "apigateway:*"
            ],
            "Resource": "arn:aws:apigateway:*::/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "cloudformation:*"
            ],
            "Resource": "*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "cloudformation:DescribeStacks",
                "cloudformation:ListStackResources",
                "lambda:DeleteFunction",
                "lambda:CreateFunction",
                "lambda:GetFunction",
                "lambda:GetFunctionCodeSigningConfig",
                "lambda:ListTags",
                "lambda:TagResource",
                "lambda:UpdateFunctionCode",
                "lambda:UpdateFunctionConfiguration",
                "lambda:AddPermission"
            ],
            "Resource": "*"
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
        }
    ]
}
```
Give the policy a name, and optionaly add tags.

Next create a new IAM user. Attach the policy created above to this user. Generate a set of access keys for this user, these need to be stored as secrets in github.

Next, create an IAM role. Choose trusted entity type AWS Service, and for common use cases set "Lambda". Attach policies:
 - SecretsManagerReadWrite
 - AWSLambdaBasicExecutionRole
Save the role ARN, it will be needed for later.

## Create secrets
There are 3 secrets that need to be created with Secrets Manager. So open Secrets Manager, and create:
- name: appId, type: plaintext - set the id of the github app
- name: privateKey, type: plaintext - set the ghapp.pem signature
- name: wehbookSecret, type: plaintext - set the secret you will use for the github app webhook

# Configure ghrunner-app repo
Deployment workflow runs over an environment. So head to the repository settings, and create an environment called `protected`. Then create a selected branches protection rule and set the default branch as a rule (main/master). After that, add secrets:
 - AWS_ACCESS_KEY_ID: `<aws access key id from user created above>`
 - AWS_SECRET_ACCESS_KEY: `<aws secret access key from user created above>`
 - AWS_REGION: `<aws region used to create resources above>`
 - AWS_ARN_ROLE: `<arn of the role created above>`
 - AWS_S3_BUCKET: `<only the name of the bucket created above, not an arn>`
 - BRANCH: `<branch to checkout of the repo where the app is installed, and where runners deployment workflow resides>`
 - JOB_FILTER: `<taken from the jobs labels, to filter for which jobs runner will be created>`
 - OWNER: `<owner of the repo where the app is installed>`
 - REPO: `<name of the repo where the app is installed>`
 - WORKFLOW_FILE_NAME: `<the name of the workflow file that deploys the runners, like: runners.yaml>`

# Next and final steps
1. Deploy the Lambda function
2. After deployment is done, login to AWS, and find the Lambda function
3. Grab the trigger URL
4. Update github app settings by setting the webhook URL and the secret