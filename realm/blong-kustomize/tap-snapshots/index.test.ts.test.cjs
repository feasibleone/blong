/* IMPORTANT
 * This snapshot file is auto-generated, but designed for humans.
 * It should be checked into source control and tracked carefully.
 * Re-generate by setting TAP_SNAPSHOT=1 and running tests.
 * Make sure to inspect the output below.  Do not ignore changes!
 */
'use strict'
exports[`index.test.ts > TAP > kustomize flow (server) > plan find > planIsDeterministic > plan 1`] = `
Object {
  "assets": Array [],
  "backingServiceRequest": Object {},
  "backingServices": Array [],
  "crd": undefined,
  "deployments": Array [
    Object {
      "layers": Array [
        "kustomize.orchestrator",
        "kustomize.gateway",
        "srv.orchestrator",
      ],
      "name": "kustomize",
      "namespaces": Array [
        "kustomize",
        "identity",
        "login",
        "session",
      ],
      "realms": Array [
        "kustomize",
        "srv",
      ],
      "replicas": 1,
      "resources": Object {
        "limits": Object {
          "cpu": "1",
          "memory": "512Mi",
        },
        "requests": Object {
          "cpu": "50m",
          "memory": "128Mi",
        },
      },
    },
  ],
  "externalServices": Array [],
  "ingresses": Array [],
  "install": false,
  "manifests": Array [],
  "nodes": Array [
    "node-a",
    "node-b",
  ],
  "operator": Object {
    "image": undefined,
    "ingress": undefined,
    "intervalSeconds": 60,
    "replicas": 1,
  },
  "portal": Object {},
  "profile": "realm",
  "secrets": Array [],
  "services": Array [
    Object {
      "deployment": "kustomize",
      "name": "kustomize",
      "namespace": "blong-suite",
    },
    Object {
      "deployment": "kustomize",
      "name": "identity",
      "namespace": "blong-suite",
    },
    Object {
      "deployment": "kustomize",
      "name": "login",
      "namespace": "blong-suite",
    },
    Object {
      "deployment": "kustomize",
      "name": "session",
      "namespace": "blong-suite",
    },
  ],
  "suite": Object {
    "database": false,
    "entry": undefined,
    "frameworkImage": "ghcr.io/feasibleone/blong-gogo",
    "intents": undefined,
    "minFrameworkVersion": undefined,
    "name": "blong-suite",
    "namespace": "blong-suite",
    "version": "0.1.0",
  },
  "suiteVolume": Object {
    "artifact": undefined,
    "attemptRetention": 5,
    "backend": "nodeLocal",
    "retention": 3,
    "rwxManifest": undefined,
    "rwxProvider": undefined,
    "storageClassName": undefined,
  },
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aChangedJobIsANewJob > jobNames 1`] = `
Object {
  "file": "deployer/migrate.yaml",
  "first": "shop-migrate-9.9.9-00cc20c1",
  "otherEntry": "shop-migrate-9.9.9-659a07dd",
  "otherVersion": "shop-migrate-9.9.10-7a6ac581",
  "regenerated": "shop-migrate-9.9.9-00cc20c1",
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aCrSpecDrivesTheTree > crSpec 1`] = `
Object {
  "namedAfterTheSpec": Array [],
  "namespaces": Array [
    "namespaces/blong-suite.yaml",
  ],
  "processes": Array [
    "deployments/blong-suite.yaml",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aDeploymentBringsItsOwnServices > backingService 1`] = `
Object {
  "alias": Object {
    "apiVersion": "v1",
    "kind": "Service",
    "metadata": Object {
      "labels": Object {
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/spec-hash": "4c623faf75bb23a7",
      },
      "name": "mysql",
      "namespace": "shop-suite",
    },
    "spec": Object {
      "externalName": "mysql.shop-services.svc.cluster.local",
      "ports": Array [
        Object {
          "name": "mysql",
          "port": 3306,
        },
      ],
      "type": "ExternalName",
    },
  },
  "claim": Object {
    "apiVersion": "v1",
    "kind": "PersistentVolumeClaim",
    "metadata": Object {
      "labels": Object {
        "app": "mysql",
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/spec-hash": "a99088295630014d",
      },
      "name": "mysql-data",
      "namespace": "shop-services",
    },
    "spec": Object {
      "accessModes": Array [
        "ReadWriteOnce",
      ],
      "resources": Object {
        "requests": Object {
          "storage": "10Gi",
        },
      },
      "storageClassName": "local-path",
    },
  },
  "credentials": Object {
    "apiVersion": "v1",
    "kind": "Secret",
    "metadata": Object {
      "labels": Object {
        "app": "mysql",
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/generated-credentials": "true",
        "blong.feasible.one/spec-hash": "cede31e07e6e7e45",
      },
      "name": "mysql-credentials",
      "namespace": "shop-services",
    },
    "stringData": Object {
      "MYSQL_PASSWORD": "bfb7c675e4c0982a449a68f1c",
      "MYSQL_USER": "b4bd05a5cb1393a8dfca1ec82",
    },
    "type": "Opaque",
  },
  "files": Array [
    "namespaces/shop-services.yaml",
    "services/mysql/claim.yaml",
    "services/mysql/credentials-in-suite.yaml",
    "services/mysql/credentials.yaml",
    "services/mysql/deployment.yaml",
    "services/mysql/init-config.yaml",
    "services/mysql/service.yaml",
  ],
  "init": Object {
    "apiVersion": "v1",
    "data": Object {
      "init.sql": String(
        CREATE DATABASE IF NOT EXISTS \`blong-suite\`;
        CREATE DATABASE IF NOT EXISTS \`blong-access\`;
        
      ),
    },
    "kind": "ConfigMap",
    "metadata": Object {
      "labels": Object {
        "app": "mysql",
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/spec-hash": "d44f45069d78cada",
      },
      "name": "mysql-init-config",
      "namespace": "shop-services",
    },
  },
  "workload": Object {
    "apiVersion": "apps/v1",
    "kind": "Deployment",
    "metadata": Object {
      "labels": Object {
        "app": "mysql",
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "shop",
        "app.kubernetes.io/part-of": "shop",
        "app.kubernetes.io/version": "9.9.9",
        "blong.feasible.one/spec-hash": "714490c5d90fc458",
      },
      "name": "mysql",
      "namespace": "shop-services",
    },
    "spec": Object {
      "replicas": 1,
      "selector": Object {
        "matchLabels": Object {
          "app": "mysql",
        },
      },
      "template": Object {
        "metadata": Object {
          "labels": Object {
            "app": "mysql",
          },
        },
        "spec": Object {
          "containers": Array [
            Object {
              "env": Array [
                Object {
                  "name": "MYSQL_USER",
                  "valueFrom": Object {
                    "secretKeyRef": Object {
                      "key": "MYSQL_USER",
                      "name": "mysql-credentials",
                    },
                  },
                },
                Object {
                  "name": "MYSQL_PASSWORD",
                  "valueFrom": Object {
                    "secretKeyRef": Object {
                      "key": "MYSQL_PASSWORD",
                      "name": "mysql-credentials",
                    },
                  },
                },
              ],
              "image": "mysql/mysql-server:8.0.32",
              "livenessProbe": Object {
                "exec": Object {
                  "command": Array [
                    "mysqladmin",
                    "ping",
                    "-h",
                    "127.0.0.1",
                  ],
                },
                "failureThreshold": 10,
                "initialDelaySeconds": 40,
                "periodSeconds": 30,
                "timeoutSeconds": 20,
              },
              "name": "mysql",
              "ports": Array [
                Object {
                  "containerPort": 3306,
                  "name": "mysql",
                },
              ],
              "readinessProbe": Object {
                "exec": Object {
                  "command": Array [
                    "mysqladmin",
                    "ping",
                    "-h",
                    "127.0.0.1",
                  ],
                },
                "initialDelaySeconds": 20,
                "periodSeconds": 10,
              },
              "resources": Object {
                "limits": Object {
                  "cpu": "1",
                  "memory": "768Mi",
                },
                "requests": Object {
                  "cpu": "50m",
                  "memory": "512Mi",
                },
              },
              "volumeMounts": Array [
                Object {
                  "mountPath": "/var/lib/mysql",
                  "name": "mysql-data",
                },
                Object {
                  "mountPath": "/docker-entrypoint-initdb.d",
                  "name": "mysql-init",
                },
              ],
            },
          ],
          "initContainers": Array [
            Object {
              "command": Array [
                "sh",
                "-c",
                "chown -R 27:27 /var/lib/mysql",
              ],
              "image": "busybox:1.36.1",
              "name": "volume-permissions",
              "volumeMounts": Array [
                Object {
                  "mountPath": "/var/lib/mysql",
                  "name": "mysql-data",
                },
              ],
            },
          ],
          "volumes": Array [
            Object {
              "name": "mysql-data",
              "persistentVolumeClaim": Object {
                "claimName": "mysql-data",
              },
            },
            Object {
              "configMap": Object {
                "name": "mysql-init-config",
              },
              "name": "mysql-init",
            },
          ],
        },
      },
    },
  },
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aMonolithDispatchesInsideItsOnlyProcess > profileArgs 1`] = `
Object {
  "deployment": Array [
    "/opt/deploy/suite/index.ts",
    "release",
    "--remote.canSkipSocket=true",
    "--shop.orchestrator",
  ],
  "migration": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "release",
    "--remote.canSkipSocket=true",
  ],
  "realmDeployment": Array [
    "/opt/deploy/suite/index.ts",
    "release",
    "--shop.orchestrator",
  ],
  "realmMigration": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "release",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > anAddressTravelsInTheOverlay > addressPlacement 1`] = `
Object {
  "declaredHost": "page.example.test",
  "exampleHost": "PLACEHOLDER",
  "hostInBase": false,
  "ingressInBase": Array [],
  "ingressInLocal": Array [
    "local/suite/ingresses/page-example-test.yaml",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > anArtifactEntryIsFoundInAnyDirectory > artifactEntry 1`] = `
Object {
  "mounted": "/cache/demo/9/suite/blong-suite/index.ts",
  "none": "/cache/demo/9/index.ts",
  "relative": "/cache/demo/9/index.ts",
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aSplitTreeKeepsTheArtifactOutOfTheBase > splitTree 1`] = `
Object {
  "identityInBase": false,
  "identityInBaseFiles": Array [],
  "identityInLocal": true,
  "instanceDirs": Array [
    "local/suite/cache/blong-suite-fill-0.1.0-a1b2c3d4-node-a",
    "local/suite/cache/blong-suite-fill-0.1.0-a1b2c3d4-node-b",
  ],
  "moduleInBase": false,
  "namespacesInBase": 0,
  "nodesInBase": 0,
  "nodesInLocal": 2,
  "patches": 1,
  "placeholderInBase": true,
  "placeholdersInTemplate": true,
  "realVolumeInPatch": true,
  "rootNamesNamespace": false,
  "scriptInTemplate": false,
  "scriptMounted": true,
  "suiteChildNamespace": true,
  "templatesInBase": 2,
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > aVolumeIsNamedAfterItsArtifact > volumeIdentity 1`] = `
Object {
  "absent": "1.2.3",
  "fromDigest": "1.2.3-a1b2c3d4",
  "fromStamp": "1.2.3-88bdbb60",
  "unnamed": "1.2.3",
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > eachPortalNamesItsOwnService > portalServices 1`] = `
Object {
  "files": Array [
    "services/admin-http.yaml",
    "services/adminPanel-http.yaml",
    "services/store-http.yaml",
  ],
  "ingressPaths": Array [
    Object {
      "service": Object {
        "name": "admin-http",
        "port": Object {
          "number": 8080,
        },
      },
    },
    Object {
      "service": Object {
        "name": "adminPanel-http",
        "port": Object {
          "number": 8080,
        },
      },
    },
  ],
  "selector": Object {
    "app.kubernetes.io/instance": "admin",
    "app.kubernetes.io/part-of": "shop",
  },
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > everyNamespaceTheResolverAsksForHasAService > migrationStep 1`] = `
Object {
  "args": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "release",
  ],
  "selectors": Array [],
  "waits": Array [],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > everyNamespaceTheResolverAsksForHasAService > namespaceServices 1`] = `
Object {
  "processLabels": Object {
    "app.kubernetes.io/instance": "core",
    "app.kubernetes.io/managed-by": "blong-kustomize",
    "app.kubernetes.io/name": "shop",
    "app.kubernetes.io/part-of": "shop",
    "app.kubernetes.io/version": "9.9.9",
    "blong.feasible.one/namespace-core": "true",
    "blong.feasible.one/namespace-subject": "true",
  },
  "service": Object {
    "ports": Array [
      Object {
        "name": "rpc",
        "port": 8091,
        "protocol": "TCP",
        "targetPort": "rpc",
      },
      Object {
        "name": "http",
        "port": 8080,
        "protocol": "TCP",
        "targetPort": "http",
      },
    ],
    "selector": Object {
      "app.kubernetes.io/part-of": "shop",
      "blong.feasible.one/namespace-subject": "true",
    },
    "type": "ClusterIP",
  },
  "services": Array [
    "services/access.yaml",
    "services/core.yaml",
    "services/subject.yaml",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > everyReferenceInTheTreeResolves > danglingReferences 1`] = `
Object {
  "ingress": Array [
    "ingresses/shop.yaml: the path \\"/\\" points at Service \\"gone\\", which this tree does not define",
  ],
  "mount": Array [
    "deployments/shop.yaml: a container mounts volume \\"missing\\", which nothing declares",
  ],
  "resolved": Array [],
  "selector": Array [
    "services/other.yaml: nothing in this tree carries app.kubernetes.io/name=other",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > objectsAreFingerprinted > generatedFileCount 1`] = `
23
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > objectsAreFingerprinted > generatedTree 1`] = `
Object {
  "cache/blong-suite-fill-1.0.0-node-a.yaml": String(
    apiVersion: batch/v1
    kind: Job
    metadata:
      labels:
        app.kubernetes.io/instance: blong-suite-fill-1.0.0-node-a
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/retention: "3"
        blong.feasible.one/spec-hash: b01fb66f425efc29
        blong.feasible.one/suite-version: 1.0.0
        blong.feasible.one/volume-identity: 1.0.0
      name: blong-suite-fill-1.0.0-node-a
      namespace: blong-suite
    spec:
      backoffLimit: 1
      template:
        metadata:
          labels:
            app.kubernetes.io/instance: blong-suite-fill-1.0.0-node-a
            app.kubernetes.io/managed-by: blong-kustomize
            app.kubernetes.io/name: blong-suite
            app.kubernetes.io/part-of: blong-suite
            app.kubernetes.io/version: 1.0.0
        spec:
          containers:
            - command:
                - node
                - /script/fill.mts
              env:
                - name: BLONG_ARTIFACT_ROOT
                  value: /var/lib/blong/suites/blong-suite
                - name: BLONG_ARTIFACT_IDENTITY
                  value: 1.0.0
                - name: BLONG_ARTIFACT_KEEP
                  value: "3"
                - name: BLONG_ARTIFACT_URL
                  value: ""
              image: ghcr.io/feasibleone/blong-gogo:latest
              name: fill
              resources:
                limits:
                  cpu: "1"
                  memory: 512Mi
                requests:
                  cpu: 50m
                  memory: 128Mi
              securityContext:
                runAsUser: 0
              volumeMounts:
                - mountPath: /var/lib/blong/suites/blong-suite
                  name: suite
                - mountPath: /script
                  name: fill-script
                  readOnly: true
          nodeSelector:
            kubernetes.io/hostname: node-a
          restartPolicy: Never
          serviceAccountName: blong
          volumes:
            - hostPath:
                path: /var/lib/blong/suites/blong-suite
                type: DirectoryOrCreate
              name: suite
            - configMap:
                name: fill-script
              name: fill-script
    
  ),
  "cache/blong-suite-fill-1.0.0-node-b.yaml": String(
    apiVersion: batch/v1
    kind: Job
    metadata:
      labels:
        app.kubernetes.io/instance: blong-suite-fill-1.0.0-node-b
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/retention: "3"
        blong.feasible.one/spec-hash: 53b695dce95b4142
        blong.feasible.one/suite-version: 1.0.0
        blong.feasible.one/volume-identity: 1.0.0
      name: blong-suite-fill-1.0.0-node-b
      namespace: blong-suite
    spec:
      backoffLimit: 1
      template:
        metadata:
          labels:
            app.kubernetes.io/instance: blong-suite-fill-1.0.0-node-b
            app.kubernetes.io/managed-by: blong-kustomize
            app.kubernetes.io/name: blong-suite
            app.kubernetes.io/part-of: blong-suite
            app.kubernetes.io/version: 1.0.0
        spec:
          containers:
            - command:
                - node
                - /script/fill.mts
              env:
                - name: BLONG_ARTIFACT_ROOT
                  value: /var/lib/blong/suites/blong-suite
                - name: BLONG_ARTIFACT_IDENTITY
                  value: 1.0.0
                - name: BLONG_ARTIFACT_KEEP
                  value: "3"
                - name: BLONG_ARTIFACT_URL
                  value: ""
              image: ghcr.io/feasibleone/blong-gogo:latest
              name: fill
              resources:
                limits:
                  cpu: "1"
                  memory: 512Mi
                requests:
                  cpu: 50m
                  memory: 128Mi
              securityContext:
                runAsUser: 0
              volumeMounts:
                - mountPath: /var/lib/blong/suites/blong-suite
                  name: suite
                - mountPath: /script
                  name: fill-script
                  readOnly: true
          nodeSelector:
            kubernetes.io/hostname: node-b
          restartPolicy: Never
          serviceAccountName: blong
          volumes:
            - hostPath:
                path: /var/lib/blong/suites/blong-suite
                type: DirectoryOrCreate
              name: suite
            - configMap:
                name: fill-script
              name: fill-script
    
  ),
  "cache/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - blong-suite-fill-1.0.0-node-a.yaml
      - blong-suite-fill-1.0.0-node-b.yaml
    
  ),
  "configmaps/fill-script.yaml": String(
    apiVersion: v1
    binaryData:
      fill.mts: aW1wb3J0e2V4ZWNGaWxlU3luY31mcm9tIm5vZGU6Y2hpbGRfcHJvY2VzcyI7aW1wb3J0e2Nsb3NlU3luYyxjb3B5RmlsZVN5bmMsY3JlYXRlUmVhZFN0cmVhbSxjcmVhdGVXcml0ZVN0cmVhbSxleGlzdHNTeW5jLGZzdGF0U3luYyxta2RpclN5bmMsb3BlblN5bmMscmVhZGRpclN5bmMscmVhZGxpbmtTeW5jLHJlYWRTeW5jLHJlYWxwYXRoU3luYyxyZW5hbWVTeW5jLHJtU3luYyxzdGF0U3luYyxzeW1saW5rU3luYyx1bmxpbmtTeW5jLHdyaXRlRmlsZVN5bmN9ZnJvbSJub2RlOmZzIjtpbXBvcnR7dG1wZGlyfWZyb20ibm9kZTpvcyI7aW1wb3J0e2Rpcm5hbWUsaXNBYnNvbHV0ZSxqb2luLHJlbGF0aXZlfWZyb20ibm9kZTpwYXRoIjtpbXBvcnR7UmVhZGFibGV9ZnJvbSJub2RlOnN0cmVhbSI7aW1wb3J0e3BpcGVsaW5lfWZyb20ibm9kZTpzdHJlYW0vcHJvbWlzZXMiO2ltcG9ydHtmaWxlVVJMVG9QYXRofWZyb20ibm9kZTp1cmwiO2ltcG9ydHtjcmVhdGVJbmZsYXRlUmF3fWZyb20ibm9kZTp6bGliIjtleHBvcnQgY29uc3QgRklMTF9FTlY9e3Jvb3Q6IkJMT05HX0FSVElGQUNUX1JPT1QiLGlkZW50aXR5OiJCTE9OR19BUlRJRkFDVF9JREVOVElUWSIsa2VlcDoiQkxPTkdfQVJUSUZBQ1RfS0VFUCIsdXJsOiJCTE9OR19BUlRJRkFDVF9VUkwiLHBhdGg6IkJMT05HX0FSVElGQUNUX1BBVEgifTtleHBvcnQgY29uc3QgQVJUSUZBQ1RfUkVBRFk9Ii5ibG9uZy1hcnRpZmFjdC1yZWFkeSI7bGV0IExJTktfU0NSSVBUPSJjcmVhdGUtbGlua3MuanMiLHJlYWRBdD0oZmQsb2Zmc2V0LGxlbmd0aCk9PntsZXQgYnl0ZXM9QnVmZmVyLmFsbG9jKGxlbmd0aCk7cmV0dXJuIHJlYWRTeW5jKGZkLGJ5dGVzLDAsbGVuZ3RoLG9mZnNldCksYnl0ZXN9O2V4cG9ydCBjb25zdCB1bnBhY2taaXA9YXN5bmMoYXJjaGl2ZSx0YXJnZXQpPT57bGV0IGZkPW9wZW5TeW5jKGFyY2hpdmUsInIiKTt0cnl7bGV0IHNpemU9ZnN0YXRTeW5jKGZkKS5zaXplLHRhaWxMZW5ndGg9TWF0aC5taW4oc2l6ZSw2NTU1NyksZW5kPXNpemUtdGFpbExlbmd0aCsodGFpbD0+e2ZvcihsZXQgYXQ9dGFpbC5sZW5ndGgtMjI7YXQ+PTA7YXQtLSlpZigweDYwNTRiNTA9PT10YWlsLnJlYWRVSW50MzJMRShhdCkpcmV0dXJuIGF0O3Rocm93IEVycm9yKCJ0aGUgYXJjaGl2ZSBoYXMgbm8gZW5kIG9mIGNlbnRyYWwgZGlyZWN0b3J5IHJlY29yZDogaXQgaXMgbm90IGEgemlwIil9KShyZWFkQXQoZmQsc2l6ZS10YWlsTGVuZ3RoLHRhaWxMZW5ndGgpKSxjb3VudD1yZWFkQXQoZmQsZW5kKzEwLDIpLnJlYWRVSW50MTZMRSgwKSxkaXJlY3RvcnlTaXplPXJlYWRBdChmZCxlbmQrMTIsNCkucmVhZFVJbnQzMkxFKDApLGRpcmVjdG9yeVN0YXJ0PXJlYWRBdChmZCxlbmQrMTYsNCkucmVhZFVJbnQzMkxFKDApO2lmKDB4ZmZmZmZmZmY9PT1kaXJlY3RvcnlTaXplfHwweGZmZmZmZmZmPT09ZGlyZWN0b3J5U3RhcnR8fGRpcmVjdG9yeVN0YXJ0K2RpcmVjdG9yeVNpemU+c2l6ZSl0aHJvdyBFcnJvcigidGhlIGFyY2hpdmUgaXMgYSB6aXA2NCBvbmUsIG9yIHNheXMgaXRzIGRpcmVjdG9yeSBpcyBvdXRzaWRlIGl0Iik7bGV0IGRpcmVjdG9yeT1yZWFkQXQoZmQsZGlyZWN0b3J5U3RhcnQsZGlyZWN0b3J5U2l6ZSksd2hlcmU9YCR7dGFyZ2V0fS9gLGN1cnNvcj0wO2ZvcihsZXQgaW5kZXg9MDtpbmRleDxjb3VudDtpbmRleCsrKXtpZigweDIwMTRiNTAhPT1kaXJlY3RvcnkucmVhZFVJbnQzMkxFKGN1cnNvcikpdGhyb3cgRXJyb3IoInRoZSBhcmNoaXZlIHNheXMgaXQgaG9sZHMgbW9yZSBlbnRyaWVzIHRoYW4gaXRzIGNlbnRyYWwgZGlyZWN0b3J5IGRvZXMiKTtsZXQgZmxhZ3M9ZGlyZWN0b3J5LnJlYWRVSW50MTZMRShjdXJzb3IrOCksbWV0aG9kPWRpcmVjdG9yeS5yZWFkVUludDE2TEUoY3Vyc29yKzEwKSxjb21wcmVzc2VkU2l6ZT1kaXJlY3RvcnkucmVhZFVJbnQzMkxFKGN1cnNvcisyMCksdW5jb21wcmVzc2VkU2l6ZT1kaXJlY3RvcnkucmVhZFVJbnQzMkxFKGN1cnNvcisyNCksbmFtZUxlbmd0aD1kaXJlY3RvcnkucmVhZFVJbnQxNkxFKGN1cnNvcisyOCksZXh0cmFMZW5ndGg9ZGlyZWN0b3J5LnJlYWRVSW50MTZMRShjdXJzb3IrMzApLGNvbW1lbnRMZW5ndGg9ZGlyZWN0b3J5LnJlYWRVSW50MTZMRShjdXJzb3IrMzIpLGxvY2FsPWRpcmVjdG9yeS5yZWFkVUludDMyTEUoY3Vyc29yKzQyKSxuYW1lPWRpcmVjdG9yeS50b1N0cmluZygidXRmOCIsY3Vyc29yKzQ2LGN1cnNvcis0NituYW1lTGVuZ3RoKTtpZihjdXJzb3IrPTQ2K25hbWVMZW5ndGgrZXh0cmFMZW5ndGgrY29tbWVudExlbmd0aCxuYW1lLmVuZHNXaXRoKCIvIikpY29udGludWU7aWYoMSZmbGFncyl0aHJvdyBFcnJvcihgJHtuYW1lfSBpcyBlbmNyeXB0ZWQsIHdoaWNoIHRoaXMgcmVhZGVyIGRvZXMgbm90IHJlYWRgKTtpZigweGZmZmZmZmZmPT09Y29tcHJlc3NlZFNpemV8fDB4ZmZmZmZmZmY9PT11bmNvbXByZXNzZWRTaXplfHwweGZmZmZmZmZmPT09bG9jYWwpdGhyb3cgRXJyb3IoYCR7bmFtZX0gaXMgYSB6aXA2NCBlbnRyeSwgd2hpY2ggdGhpcyByZWFkZXIgZG9lcyBub3QgcmVhZGApO2xldCB3cml0dGVuPWpvaW4odGFyZ2V0LG5hbWUpO2lmKCF3cml0dGVuLnN0YXJ0c1dpdGgod2hlcmUpKXRocm93IEVycm9yKGAke25hbWV9IHdvdWxkIGJlIHVucGFja2VkIG91dHNpZGUgJHt0YXJnZXR9YCk7aWYoMCE9PW1ldGhvZCYmOCE9PW1ldGhvZCl0aHJvdyBFcnJvcihgJHtuYW1lfSBpcyBjb21wcmVzc2VkIHdpdGggbWV0aG9kICR7bWV0aG9kfSwgd2hpY2ggdGhpcyByZWFkZXIgZG9lcyBub3QgcmVhZGApO2lmKG1rZGlyU3luYyhqb2luKHdyaXR0ZW4sIi4uIikse3JlY3Vyc2l2ZTohMH0pLDA9PT1jb21wcmVzc2VkU2l6ZSl7d3JpdGVGaWxlU3luYyh3cml0dGVuLCIiKTtjb250aW51ZX1sZXQgaGVhZGVyPXJlYWRBdChmZCxsb2NhbCwzMCksZnJvbT1sb2NhbCszMCtoZWFkZXIucmVhZFVJbnQxNkxFKDI2KStoZWFkZXIucmVhZFVJbnQxNkxFKDI4KSxwYWNrZWQ9Y3JlYXRlUmVhZFN0cmVhbShhcmNoaXZlLHtzdGFydDpmcm9tLGVuZDpmcm9tK2NvbXByZXNzZWRTaXplLTF9KTswPT09bWV0aG9kP2F3YWl0IHBpcGVsaW5lKHBhY2tlZCxjcmVhdGVXcml0ZVN0cmVhbSh3cml0dGVuKSk6YXdhaXQgcGlwZWxpbmUocGFja2VkLGNyZWF0ZUluZmxhdGVSYXcoKSxjcmVhdGVXcml0ZVN0cmVhbSh3cml0dGVuKSl9fWZpbmFsbHl7Y2xvc2VTeW5jKGZkKX19O2V4cG9ydCBjb25zdCBsaW5rQXQ9dGFyZ2V0PT57ZXhpc3RzU3luYyhqb2luKHRhcmdldCxMSU5LX1NDUklQVCkpJiZleGVjRmlsZVN5bmMocHJvY2Vzcy5leGVjUGF0aCxbTElOS19TQ1JJUFQsImNyZWF0ZSJdLHtjd2Q6dGFyZ2V0LHN0ZGlvOiJpbmhlcml0In0pfTtleHBvcnQgY29uc3QgcmVsYXRpdml6ZUxpbmtzPXRhcmdldD0+e2xldCByZXdyaXR0ZW49MCx3YWxrPWRpcmVjdG9yeT0+e2ZvcihsZXQgZW50cnkgb2YgcmVhZGRpclN5bmMoZGlyZWN0b3J5LHt3aXRoRmlsZVR5cGVzOiEwfSkpe2xldCBwYXRoPWpvaW4oZGlyZWN0b3J5LGVudHJ5Lm5hbWUpO2lmKGVudHJ5LmlzU3ltYm9saWNMaW5rKCkpe2xldCBwb2ludHNBdD1yZWFkbGlua1N5bmMocGF0aCk7aXNBYnNvbHV0ZShwb2ludHNBdCkmJih1bmxpbmtTeW5jKHBhdGgpLHN5bWxpbmtTeW5jKHJlbGF0aXZlKGRpcmVjdG9yeSxwb2ludHNBdCkscGF0aCkscmV3cml0dGVuKyspfWVsc2UgZW50cnkuaXNEaXJlY3RvcnkoKSYmd2FsayhwYXRoKX19O3JldHVybiB3YWxrKHRhcmdldCkscmV3cml0dGVufTtleHBvcnQgY29uc3QgY29weVRyZWU9KHNvdXJjZSx0YXJnZXQpPT57Zm9yKGxldCBlbnRyeSBvZiByZWFkZGlyU3luYyhzb3VyY2UpKXtsZXQgZnJvbT1qb2luKHNvdXJjZSxlbnRyeSksdG89am9pbih0YXJnZXQsZW50cnkpO3N0YXRTeW5jKGZyb20pLmlzRGlyZWN0b3J5KCk/KG1rZGlyU3luYyh0byx7cmVjdXJzaXZlOiEwfSksY29weVRyZWUoZnJvbSx0bykpOmNvcHlGaWxlU3luYyhmcm9tLHRvKX19O2V4cG9ydCBjb25zdCBkb3dubG9hZD1hc3luYyh1cmwsdG8pPT57bGV0IGFuc3dlcj1hd2FpdCBmZXRjaCh1cmwpO2lmKCFhbnN3ZXIub2t8fCFhbnN3ZXIuYm9keSl0aHJvdyBFcnJvcihgdGhlIGFydGlmYWN0IGF0ICR7dXJsfSBhbnN3ZXJlZCAke2Fuc3dlci5zdGF0dXN9ICR7YW5zd2VyLnN0YXR1c1RleHR9YCk7bGV0IGJvZHk9YW5zd2VyLmJvZHk7YXdhaXQgcGlwZWxpbmUoUmVhZGFibGUuZnJvbShib2R5KSxjcmVhdGVXcml0ZVN0cmVhbSh0bykpfTtleHBvcnQgY29uc3QgZmlsbEFydGlmYWN0PWFzeW5jIHJlcXVlc3Q9PntsZXR7c291cmNlLHRhcmdldH09cmVxdWVzdDtpZihybVN5bmMoam9pbih0YXJnZXQsQVJUSUZBQ1RfUkVBRFkpLHtmb3JjZTohMH0pLHJtU3luYyh0YXJnZXQse3JlY3Vyc2l2ZTohMCxmb3JjZTohMH0pLG1rZGlyU3luYyh0YXJnZXQse3JlY3Vyc2l2ZTohMH0pLHNvdXJjZS5wYXRoKWNvcHlUcmVlKHNvdXJjZS5wYXRoLHRhcmdldCk7ZWxzZSBpZihzb3VyY2UudXJsKXtsZXQgYXJjaGl2ZT1qb2luKHRtcGRpcigpLGBibG9uZy1hcnRpZmFjdC0ke3Byb2Nlc3MucGlkfS56aXBgKTt0cnl7YXdhaXQgZG93bmxvYWQoc291cmNlLnVybCxhcmNoaXZlKSxhd2FpdCB1bnBhY2taaXAoYXJjaGl2ZSx0YXJnZXQpfWZpbmFsbHl7cm1TeW5jKGFyY2hpdmUse2ZvcmNlOiEwfSl9fWVsc2UgdGhyb3cgRXJyb3IoInRoZSBhcnRpZmFjdCBuYW1lcyBuZWl0aGVyIGEgdXJsIHRvIGZldGNoIG5vciBhIHBhdGggdG8gcmVhZCIpO2xpbmtBdCh0YXJnZXQpLHJlbGF0aXZpemVMaW5rcyh0YXJnZXQpLHdyaXRlRmlsZVN5bmMoam9pbih0YXJnZXQsQVJUSUZBQ1RfUkVBRFkpLCIiKSx2b2lkIDAhPT1yZXF1ZXN0LmtlZXAmJmtlZXBOZXdlc3QoZGlybmFtZSh0YXJnZXQpLHJlcXVlc3Qua2VlcCl9O2V4cG9ydCBjb25zdCBrZWVwTmV3ZXN0PShyb290LGtlZXApPT57Zm9yKGxldHtuYW1lfW9mIHJlYWRkaXJTeW5jKHJvb3Qse3dpdGhGaWxlVHlwZXM6ITB9KS5maWx0ZXIoZW50cnk9PmVudHJ5LmlzRGlyZWN0b3J5KCkpLm1hcChlbnRyeT0+KHtuYW1lOmVudHJ5Lm5hbWUsYXQ6c3RhdFN5bmMoam9pbihyb290LGVudHJ5Lm5hbWUpKS5tdGltZU1zfSkpLnNvcnQoKGxlZnQscmlnaHQpPT5yaWdodC5hdC1sZWZ0LmF0KS5zbGljZShrZWVwKSlybVN5bmMoam9pbihyb290LG5hbWUpLHtyZWN1cnNpdmU6ITAsZm9yY2U6ITB9KX07ZXhwb3J0IGNvbnN0IGRyb3BTdGFsZVN0YWdpbmc9KHJvb3Qsb2xkZXJUaGFuTXM9MzZlNSk9PntsZXQgbm93PURhdGUubm93KCk7Zm9yKGxldCBlbnRyeSBvZiByZWFkZGlyU3luYyhyb290LHt3aXRoRmlsZVR5cGVzOiEwfSkpZW50cnkuaXNEaXJlY3RvcnkoKSYmZW50cnkubmFtZS5zdGFydHNXaXRoKCIuc3RhZ2luZy0iKSYmKG5vdy1zdGF0U3luYyhqb2luKHJvb3QsZW50cnkubmFtZSkpLm10aW1lTXM8b2xkZXJUaGFuTXN8fHJtU3luYyhqb2luKHJvb3QsZW50cnkubmFtZSkse3JlY3Vyc2l2ZTohMCxmb3JjZTohMH0pKX07ZXhwb3J0IGNvbnN0IGZpbGxGcm9tRW52aXJvbm1lbnQ9YXN5bmMoKT0+e2xldCBlbnY9cHJvY2Vzcy5lbnYscm9vdD1lbnZbRklMTF9FTlYucm9vdF0saWRlbnRpdHk9ZW52W0ZJTExfRU5WLmlkZW50aXR5XSxrZWVwPWVudltGSUxMX0VOVi5rZWVwXTtpZighcm9vdHx8IWlkZW50aXR5fHwha2VlcCl0aHJvdyBFcnJvcihgJHtGSUxMX0VOVi5yb290fSwgJHtGSUxMX0VOVi5pZGVudGl0eX0gYW5kICR7RklMTF9FTlYua2VlcH0gYXJlIGFsbCByZXF1aXJlZGApO2xldCB0YXJnZXQ9am9pbihyb290LGlkZW50aXR5KTtpZihleGlzdHNTeW5jKGpvaW4odGFyZ2V0LEFSVElGQUNUX1JFQURZKSkpcmV0dXJuO2xldCBzdGFnaW5nPWpvaW4ocm9vdCxgLnN0YWdpbmctJHtpZGVudGl0eX1gKTtybVN5bmMoc3RhZ2luZyx7cmVjdXJzaXZlOiEwLGZvcmNlOiEwfSksbWtkaXJTeW5jKHN0YWdpbmcse3JlY3Vyc2l2ZTohMH0pLGF3YWl0IGZpbGxBcnRpZmFjdCh7c291cmNlOmVudltGSUxMX0VOVi5wYXRoXT97cGF0aDplbnZbRklMTF9FTlYucGF0aF19Ont1cmw6ZW52W0ZJTExfRU5WLnVybF0/PyIifSx0YXJnZXQ6c3RhZ2luZyxrZWVwOk51bWJlcihrZWVwKX0pLHJtU3luYyh0YXJnZXQse3JlY3Vyc2l2ZTohMCxmb3JjZTohMH0pLHJlbmFtZVN5bmMoc3RhZ2luZyx0YXJnZXQpLGRyb3BTdGFsZVN0YWdpbmcocm9vdCl9OygoKT0+e2xldCBlbnRyeT1wcm9jZXNzLmFyZ3ZbMV07aWYoIWVudHJ5KXJldHVybiExO3RyeXtyZXR1cm4gcmVhbHBhdGhTeW5jKGVudHJ5KT09PWZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKX1jYXRjaHtyZXR1cm4hMX19KSgpJiZhd2FpdCBmaWxsRnJvbUVudmlyb25tZW50KCk7
    kind: ConfigMap
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 081981908d1d261f
      name: fill-script
      namespace: blong-suite
    
  ),
  "configmaps/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - fill-script.yaml
    
  ),
  "deployments/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - kustomize.yaml
    
  ),
  "deployments/kustomize.yaml": String(
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      labels:
        app.kubernetes.io/instance: kustomize
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 99e2f789992e7ee4
      name: kustomize
      namespace: blong-suite
    spec:
      replicas: 1
      selector:
        matchLabels:
          app.kubernetes.io/instance: kustomize
          app.kubernetes.io/part-of: blong-suite
      template:
        metadata:
          labels:
            app.kubernetes.io/instance: kustomize
            app.kubernetes.io/managed-by: blong-kustomize
            app.kubernetes.io/name: blong-suite
            app.kubernetes.io/part-of: blong-suite
            app.kubernetes.io/version: 1.0.0
            blong.feasible.one/namespace-identity: "true"
            blong.feasible.one/namespace-kustomize: "true"
            blong.feasible.one/namespace-login: "true"
            blong.feasible.one/namespace-session: "true"
        spec:
          containers:
            - args:
                - /opt/deploy/suite/index.ts
                - release
                - --kustomize.orchestrator
                - --kustomize.gateway
                - --srv.orchestrator
              env:
                - name: BLONG_ENV
                  value: release
                - name: BLONG_NAMESPACE
                  valueFrom:
                    fieldRef:
                      fieldPath: metadata.namespace
              image: ghcr.io/feasibleone/blong-gogo:latest
              livenessProbe:
                tcpSocket:
                  port: rpc
              name: blong
              ports:
                - containerPort: 8091
                  name: rpc
                  protocol: TCP
                - containerPort: 8080
                  name: http
                  protocol: TCP
              readinessProbe:
                tcpSocket:
                  port: rpc
              resources:
                limits:
                  cpu: "1"
                  memory: 512Mi
                requests:
                  cpu: 50m
                  memory: 128Mi
              volumeMounts:
                - mountPath: /opt/deploy/suite
                  name: suite
                  readOnly: true
                - mountPath: /home/node/.blong_releaserc
                  name: releaserc-home
                  readOnly: true
                  subPath: .blong_releaserc
                - mountPath: /etc/blong_releaserc
                  name: releaserc-site
                  readOnly: true
                  subPath: blong_releaserc
                - mountPath: /home/node/.config/blong_release/
                  name: gateway-keys
                  readOnly: true
          serviceAccountName: blong
          volumes:
            - hostPath:
                path: /var/lib/blong/suites/blong-suite/1.0.0
                type: Directory
              name: suite
            - name: releaserc-home
              secret:
                items:
                  - key: .blong_releaserc
                    path: .blong_releaserc
                optional: true
                secretName: blong-releaserc
            - name: releaserc-site
              secret:
                items:
                  - key: blong_releaserc
                    path: blong_releaserc
                optional: true
                secretName: blong-releaserc-etc
            - name: gateway-keys
              secret:
                items:
                  - key: config
                    path: config
                optional: true
                secretName: gateway-keys
    
  ),
  "kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    labels:
      - includeSelectors: false
        pairs:
          app.kubernetes.io/managed-by: blong-kustomize
          app.kubernetes.io/name: blong-suite
          app.kubernetes.io/part-of: blong-suite
          app.kubernetes.io/version: 1.0.0
    resources:
      - cache
      - configmaps
      - deployments
      - namespaces
      - rbac
      - services
    
  ),
  "namespaces/blong-suite.yaml": String(
    apiVersion: v1
    kind: Namespace
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 838762d903bd204e
      name: blong-suite
    
  ),
  "namespaces/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - blong-suite.yaml
    
  ),
  "rbac/auth-review-binding.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: ClusterRoleBinding
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 07abb2e08cee26f1
      name: blong-suite-auth-review
    roleRef:
      apiGroup: rbac.authorization.k8s.io
      kind: ClusterRole
      name: auth-review
    subjects:
      - kind: ServiceAccount
        name: blong
        namespace: blong-suite
    
  ),
  "rbac/auth-review.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: ClusterRole
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 504dbf06c5055a3a
      name: auth-review
    rules:
      - apiGroups:
          - authentication.k8s.io
        resources:
          - tokenreviews
        verbs:
          - create
      - apiGroups:
          - authorization.k8s.io
        resources:
          - subjectaccessreviews
        verbs:
          - create
    
  ),
  "rbac/blong-operator-role.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: Role
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 382363f64bfa9406
      name: blong-operator
      namespace: blong-suite
    rules:
      - apiGroups:
          - ""
        resources:
          - services
          - configmaps
          - secrets
          - persistentvolumeclaims
        verbs: &a1
          - get
          - list
          - watch
          - create
          - update
          - patch
          - delete
      - apiGroups:
          - apps
        resources:
          - deployments
          - daemonsets
          - statefulsets
        verbs: *a1
      - apiGroups:
          - batch
        resources:
          - jobs
          - cronjobs
        verbs: *a1
      - apiGroups:
          - networking.k8s.io
        resources:
          - ingresses
          - networkpolicies
        verbs: *a1
    
  ),
  "rbac/blong-operator-rolebinding.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: RoleBinding
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 6dba5a6ef9a5508a
      name: blong-operator
      namespace: blong-suite
    roleRef:
      apiGroup: rbac.authorization.k8s.io
      kind: Role
      name: blong-operator
    subjects:
      - kind: ServiceAccount
        name: blong-operator
        namespace: blong-system
    
  ),
  "rbac/jobs-role.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: Role
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: ae973ba705a2275c
      name: jobs
      namespace: blong-suite
    rules:
      - apiGroups:
          - batch
        resources:
          - jobs
          - cronjobs
        verbs:
          - get
          - list
          - watch
      - apiGroups:
          - ""
          - apps
          - networking.k8s.io
        resources:
          - pods
          - services
          - endpoints
          - deployments
          - daemonsets
          - replicasets
          - ingresses
        verbs:
          - get
          - list
          - watch
    
  ),
  "rbac/jobs-rolebinding.yaml": String(
    apiVersion: rbac.authorization.k8s.io/v1
    kind: RoleBinding
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: dd7fe97723651d28
      name: jobs
      namespace: blong-suite
    roleRef:
      apiGroup: rbac.authorization.k8s.io
      kind: Role
      name: jobs
    subjects:
      - kind: ServiceAccount
        name: blong
        namespace: blong-suite
    
  ),
  "rbac/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - auth-review-binding.yaml
      - auth-review.yaml
      - blong-operator-role.yaml
      - blong-operator-rolebinding.yaml
      - jobs-role.yaml
      - jobs-rolebinding.yaml
      - service-account.yaml
    
  ),
  "rbac/service-account.yaml": String(
    apiVersion: v1
    kind: ServiceAccount
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 1a9031474c2206ca
      name: blong
      namespace: blong-suite
    
  ),
  "services/identity.yaml": String(
    apiVersion: v1
    kind: Service
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 1a84b68d6226e1a7
      name: identity
      namespace: blong-suite
    spec:
      ports:
        - name: rpc
          port: 8091
          protocol: TCP
          targetPort: rpc
        - name: http
          port: 8080
          protocol: TCP
          targetPort: http
      selector:
        app.kubernetes.io/instance: kustomize
        app.kubernetes.io/part-of: blong-suite
      type: ClusterIP
    
  ),
  "services/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - identity.yaml
      - kustomize.yaml
      - login.yaml
      - session.yaml
    
  ),
  "services/kustomize.yaml": String(
    apiVersion: v1
    kind: Service
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 10724c0b6fb6ad1e
      name: kustomize
      namespace: blong-suite
    spec:
      ports:
        - name: rpc
          port: 8091
          protocol: TCP
          targetPort: rpc
        - name: http
          port: 8080
          protocol: TCP
          targetPort: http
      selector:
        app.kubernetes.io/instance: kustomize
        app.kubernetes.io/part-of: blong-suite
      type: ClusterIP
    
  ),
  "services/login.yaml": String(
    apiVersion: v1
    kind: Service
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 43f676f758986c93
      name: login
      namespace: blong-suite
    spec:
      ports:
        - name: rpc
          port: 8091
          protocol: TCP
          targetPort: rpc
        - name: http
          port: 8080
          protocol: TCP
          targetPort: http
      selector:
        app.kubernetes.io/instance: kustomize
        app.kubernetes.io/part-of: blong-suite
      type: ClusterIP
    
  ),
  "services/session.yaml": String(
    apiVersion: v1
    kind: Service
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: f19d81935adbc250
      name: session
      namespace: blong-suite
    spec:
      ports:
        - name: rpc
          port: 8091
          protocol: TCP
          targetPort: rpc
        - name: http
          port: 8080
          protocol: TCP
          targetPort: http
      selector:
        app.kubernetes.io/instance: kustomize
        app.kubernetes.io/part-of: blong-suite
      type: ClusterIP
    
  ),
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > olderJobAttemptsArePrunedByRetention > obsolescence 1`] = `
Object {
  "sweptKinds": 11,
  "versionNamedLeftAlone": Array [
    "the-alias",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > olderJobAttemptsArePrunedByRetention > prunable 1`] = `
Object {
  "deploymentInsideTheSuite": Array [
    "in-the-suite-too",
  ],
  "insideSuite": Array [
    "in-the-suite",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > olderJobAttemptsArePrunedByRetention > retention 1`] = `
Object {
  "attemptFallback": 5,
  "belowRetention": Array [],
  "declared": 3,
  "deploymentReplaced": true,
  "jobReplaced": false,
  "pastRetention": Array [
    "shop-migrate-0",
    "shop-migrate-1",
  ],
  "volumeFallback": 3,
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > oneIngressPerHost > ingresses 1`] = `
Object {
  "hosts": Object {
    "ingresses/api-shop-example.yaml": Object {
      "annotations": undefined,
      "host": "api.shop.example",
      "paths": Array [
        Object {
          "backend": Object {
            "service": Object {
              "name": "api-svc",
              "port": Object {
                "number": 8080,
              },
            },
          },
          "path": "/",
          "pathType": "Prefix",
        },
      ],
      "tls": Array [
        Object {
          "hosts": Array [
            "api.shop.example",
          ],
          "secretName": "api-tls",
        },
      ],
    },
    "ingresses/hooks-shop-example.yaml": Object {
      "annotations": undefined,
      "host": "hooks.shop.example",
      "paths": Array [
        Object {
          "backend": Object {
            "service": Object {
              "name": "shop",
              "port": Object {
                "number": 8080,
              },
            },
          },
          "path": "/webhook",
          "pathType": "Prefix",
        },
      ],
      "tls": undefined,
    },
    "ingresses/ui-shop-example.yaml": Object {
      "annotations": Object {
        "nginx.ingress.kubernetes.io/auth-realm": "blong deployment UI",
        "nginx.ingress.kubernetes.io/auth-secret": "ui-auth",
        "nginx.ingress.kubernetes.io/auth-type": "basic",
      },
      "host": "ui.shop.example",
      "paths": Array [
        Object {
          "backend": Object {
            "service": Object {
              "name": "store-http",
              "port": Object {
                "number": 8080,
              },
            },
          },
          "path": "/shop",
          "pathType": "Prefix",
        },
      ],
      "tls": undefined,
    },
  },
  "ingressFiles": Array [
    "ingresses/api-shop-example.yaml",
    "ingresses/hooks-shop-example.yaml",
    "ingresses/ui-shop-example.yaml",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theAttemptNameIgnoresHowTheIntentsWereSpelled > attemptNames 1`] = `
Object {
  "debug": "-migrate-9.9.9-c420b00d",
  "legacy": "-migrate-9.9.9-21cd426e",
  "omitted": "-migrate-9.9.9-21cd426e",
  "spelled": "-migrate-9.9.9-21cd426e",
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theClusterSuppliesTheConfigurationAsFiles > clusterConfiguration 1`] = `
Object {
  "deployments/kustomize.yaml": Array [
    Object {
      "env": Array [
        "BLONG_ENV=release",
        "BLONG_NAMESPACE=undefined",
      ],
      "mounts": Array [
        Object {
          "mountPath": "/opt/deploy/suite",
          "optional": undefined,
          "secretName": undefined,
        },
        Object {
          "mountPath": "/home/node/.blong_releaserc",
          "optional": true,
          "secretName": "blong-releaserc",
        },
        Object {
          "mountPath": "/etc/blong_releaserc",
          "optional": true,
          "secretName": "blong-releaserc-etc",
        },
        Object {
          "mountPath": "/home/node/.config/blong_release/",
          "optional": true,
          "secretName": "gateway-keys",
        },
      ],
    },
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theMigrationStepReadsTheFileItMounts > migrationArgs 1`] = `
Object {
  "args": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "release",
  ],
  "custom": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "custom",
    "release",
  ],
  "devOnly": Array [
    "/opt/deploy/suite/index.ts",
    "upgrade",
    "upgrade",
    "release",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theOperatorIsInstalledOnceForTheCluster > operatorInstall 1`] = `
Object {
  "addressedIngress": Object {
    "apiVersion": "networking.k8s.io/v1",
    "kind": "Ingress",
    "metadata": Object {
      "labels": Object {
        "app.kubernetes.io/managed-by": "blong-kustomize",
        "app.kubernetes.io/name": "blong-operator",
        "app.kubernetes.io/part-of": "blong-operator",
        "app.kubernetes.io/version": "0.1.0",
        "blong.feasible.one/spec-hash": "acdfe2e9caec044f",
      },
      "name": "blong-operator-test",
      "namespace": "blong-system",
    },
    "spec": Object {
      "rules": Array [
        Object {
          "host": "blong-operator.test",
          "http": Object {
            "paths": Array [
              Object {
                "backend": Object {
                  "service": Object {
                    "name": "blong-operator",
                    "port": Object {
                      "number": 8080,
                    },
                  },
                },
                "path": "/",
                "pathType": "Prefix",
              },
            ],
          },
        },
      ],
    },
  },
  "authReview": Array [
    Array [
      "tokenreviews",
      Array [
        "create",
      ],
    ],
    Array [
      "subjectaccessreviews",
      Array [
        "create",
      ],
    ],
  ],
  "installFiles": Array [
    "cache/kustomization.yaml",
    "cache/shop-fill-0.1.0-node-a.yaml",
    "cache/shop-fill-0.1.0-node-b.yaml",
    "configmaps/fill-script.yaml",
    "configmaps/kustomization.yaml",
    "crd/blongdeployment-crd.yaml",
    "crd/kustomization.yaml",
    "deployments/blong-operator.yaml",
    "deployments/kustomization.yaml",
    "kustomization.yaml",
    "namespaces/blong-system.yaml",
    "namespaces/kustomization.yaml",
    "rbac/blong-operator-clusterrole.yaml",
    "rbac/blong-operator-clusterrolebinding.yaml",
    "rbac/blong-operator-role.yaml",
    "rbac/blong-operator-rolebinding.yaml",
    "rbac/blong-operator-service-account.yaml",
    "rbac/kustomization.yaml",
    "services/blong-operator.yaml",
    "services/kustomization.yaml",
    "volumes/blong-operator-artifacts.yaml",
    "volumes/kustomization.yaml",
  ],
  "ports": Array [
    Object {
      "name": "rpc",
      "port": 8091,
      "protocol": "TCP",
      "targetPort": "rpc",
    },
    Object {
      "name": "http",
      "port": 8080,
      "protocol": "TCP",
      "targetPort": "http",
    },
  ],
  "selector": Object {
    "app.kubernetes.io/instance": "blong-operator",
    "app.kubernetes.io/part-of": "blong-operator",
  },
  "suiteFiles": Array [
    "blongdeployment.yaml",
    "cache/kustomization.yaml",
    "cache/shop-fill-0.1.0-node-a.yaml",
    "cache/shop-fill-0.1.0-node-b.yaml",
    "configmaps/fill-script.yaml",
    "configmaps/kustomization.yaml",
    "kustomization.yaml",
    "namespaces/kustomization.yaml",
    "namespaces/shop-suite.yaml",
    "rbac/auth-review-binding.yaml",
    "rbac/auth-review.yaml",
    "rbac/blong-operator-role.yaml",
    "rbac/blong-operator-rolebinding.yaml",
    "rbac/jobs-role.yaml",
    "rbac/jobs-rolebinding.yaml",
    "rbac/kustomization.yaml",
    "rbac/service-account.yaml",
  ],
  "waits": Array [],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theTreeCarriesWhatARealmDeclares > realmDeclarations 1`] = `
Object {
  "generatedFolders": Array [
    "assets/kustomization.yaml",
    "secrets/kustomization.yaml",
  ],
  "mounted": Array [
    Object {
      "hostPath": Object {
        "path": "/var/lib/blong/suites/shop/0.1.0",
        "type": "Directory",
      },
      "name": "suite",
    },
    Object {
      "name": "shop-data",
      "persistentVolumeClaim": Object {
        "claimName": "shop-data",
      },
    },
    Object {
      "name": "releaserc-home",
      "secret": Object {
        "items": Array [
          Object {
            "key": ".blong_releaserc",
            "path": ".blong_releaserc",
          },
        ],
        "optional": true,
        "secretName": "blong-releaserc",
      },
    },
    Object {
      "name": "releaserc-site",
      "secret": Object {
        "items": Array [
          Object {
            "key": "blong_releaserc",
            "path": "blong_releaserc",
          },
        ],
        "optional": true,
        "secretName": "blong-releaserc-etc",
      },
    },
    Object {
      "name": "gateway-keys",
      "secret": Object {
        "items": Array [
          Object {
            "key": "config",
            "path": "config",
          },
        ],
        "optional": true,
        "secretName": "gateway-keys",
      },
    },
  ],
  "mounts": Array [
    Array [
      Object {
        "mountPath": "/opt/deploy/suite",
        "name": "suite",
        "readOnly": true,
      },
      Object {
        "mountPath": "/var/lib/shop",
        "name": "shop-data",
      },
      Object {
        "mountPath": "/home/node/.blong_releaserc",
        "name": "releaserc-home",
        "readOnly": true,
        "subPath": ".blong_releaserc",
      },
      Object {
        "mountPath": "/etc/blong_releaserc",
        "name": "releaserc-site",
        "readOnly": true,
        "subPath": "blong_releaserc",
      },
      Object {
        "mountPath": "/home/node/.config/blong_release/",
        "name": "gateway-keys",
        "readOnly": true,
      },
    ],
  ],
  "secret": Object {
    "apiVersion": "kustomize.config.k8s.io/v1beta1",
    "kind": "Kustomization",
    "namespace": "shop-suite",
    "secretGenerator": Array [
      Object {
        "envs": Array [
          "shop-db.env",
        ],
        "name": "shop-db",
      },
    ],
  },
  "volumes": Array [
    "volumes/kustomization.yaml",
    "volumes/shop-data.yaml",
  ],
}
`

exports[`index.test.ts > TAP > kustomize flow (server) > tree generate > theVersionLabelIsTheSuitesOwn > versionLabels 1`] = `
Object {
  "declared": "9.8.7",
  "realm": "0.1.0",
  "unversioned": "0.1.0",
}
`
