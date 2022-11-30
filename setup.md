# ghapp-deployer-aws

## Create all the Secrets

In order to use this repository you must set this secrets :
``` yml
Information for the authentication
    AWS_ACCESS_KEY_ID : you can find this information inside the IAM Configuration 
    AWS_SECRET_ACCESS_KEY : you can find this information inside the IAM Configuration 
    AWS_REGION : region for the auth 
Function settings
    AWS_ARN_ROLE : this will be the ARN of the Lambda's function role  
Values for the environmental variables
    OWNER : the github owner  
    REPOSITORY : the repo name 
    WORKFLOW_FILE_NAME : the name of the workflow 
    BRANCH : the branch of the repo 
    JOB_FILTER : which type of runners we want to filter
    SECRET_ID : the AWS Secret id where are stored all the secrets
```

## AWS Preamble
In order to execute the action you must have an account with permissions for create an AWS Stack ( used by sam in the CloudFormation ), then the permissions for the creation of a AWS Lambda's Function. You also need the permissions for the AWS API creation and the permissions for reading AWS Secrets.


## AWS Secrets 
This function needs AWS Secrets in order to get some important information what will be used by Probot. The secrets must be : 

``` yml
APP_ID : The probot app ID
PRIVATE_KEY : The probot private key
WWBHOOK_SECRET : The webhook secret, created inside the probot 
```