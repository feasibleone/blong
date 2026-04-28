#! /bin/bash

if ! ../../test/integration/wait.sh; then
  echo "wait.sh failed, exiting."
  exit 1
fi

tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.http
RESULT_HTTP=$?
tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.k8s
RESULT_K8S=$?
tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.kafka
RESULT_KAFKA=$?
tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.keycloak
RESULT_KEYCLOAK=$?
tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.mongodb
RESULT_MONGODB=$?
tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.mysql
RESULT_MYSQL=$?
tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.s3
RESULT_S3=$?
tap index.test.ts --allow-incomplete-coverage --test-arg=adapter.vault
RESULT_VAULT=$?

# report list of failed tests
if [ $RESULT_HTTP -ne 0 ] || [ $RESULT_K8S -ne 0 ] || [ $RESULT_KAFKA -ne 0 ] || [ $RESULT_KEYCLOAK -ne 0 ] || [ $RESULT_MONGODB -ne 0 ] || [ $RESULT_MYSQL -ne 0 ] || [ $RESULT_S3 -ne 0 ] || [ $RESULT_VAULT -ne 0 ]; then
  echo "Integration tests failed. Results:"
  echo "HTTP: $RESULT_HTTP"
  echo "K8S: $RESULT_K8S"
  echo "Kafka: $RESULT_KAFKA"
  echo "Keycloak: $RESULT_KEYCLOAK"
  echo "MongoDB: $RESULT_MONGODB"
  echo "MySQL: $RESULT_MYSQL"
  echo "S3: $RESULT_S3"
  echo "Vault: $RESULT_VAULT"
  exit 1
else
  echo "All integration tests passed successfully."
fi
