#!/bin/bash

# Check if PULUMI_VERSION is set and non-empty
if [[ -n "$PULUMI_VERSION" ]]; then
  docker build --build-arg PULUMI_VERSION=$PULUMI_VERSION -t ghrunner-app-lambda .
else
  docker build -t ghrunner-app-lambda .
fi
