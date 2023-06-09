SHELL:=/bin/bash
function_name=ghrunner-app

build:
	cd src; \
	sam build

up: build
	sam deploy --stack-name ${function_name}-function \
		-t src/template.yml \
		--on-failure DELETE \
		--s3-bucket ${AWS_S3_BUCKET} \
		--no-confirm-changeset \
		--debug \
		--image-repository ${ECR_REPO}/ghrunner-app \
		--parameter-overrides "awsRole=${AWS_ARN_ROLE} functionName=${function_name} githubJobFilter=${JOB_FILTER} hostedZoneId=${HOSTED_ZONE_ID} fullDomainName=${FULL_DOMAIN_NAME} tlsCertificateArn=${TLS_CERTIFICATE_ARN} pulumiBackendUrl=${PULUMI_BACKEND_URL} ecrRepo=${ECR_REPO}/ghrunner-app" \
		|| exit 1

down:
	cd src; \
	sam delete --no-prompts --s3-bucket ${AWS_S3_BUCKET} --stack-name ${function_name}-function --region ${AWS_REGION} \
	|| exit 1