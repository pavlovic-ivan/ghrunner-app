FROM public.ecr.aws/lambda/nodejs:16

ARG PULUMI_VERSION=3.85.0
RUN yum install tar gzip -y \
    && curl -fsSL https://get.pulumi.com | sh -s -- --version $PULUMI_VERSION \
    && mv ~/.pulumi/bin/* /bin/ \
    && pulumi version --non-interactive

ENV PULUMI_HOME=/tmp/.pulumi

COPY package.json package-lock.json register-runner.sh config.yml ${LAMBDA_TASK_ROOT}/
COPY src/ ${LAMBDA_TASK_ROOT}/src
COPY infra/ ${LAMBDA_TASK_ROOT}/infra

RUN npm ci

CMD [ "src/server.handler" ]