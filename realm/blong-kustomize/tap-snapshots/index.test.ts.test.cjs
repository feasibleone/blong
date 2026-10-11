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
      ],
      "name": "kustomize",
      "namespaces": Array [
        "kustomize",
        "login",
      ],
      "realms": Array [
        "kustomize",
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
      "name": "login",
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
    "version": undefined,
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
21
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
      fill.mts: LyoqCiAqIGZpbGwudHMg4oCUIGJyaW5nIGEgc3VpdGUgYXJ0aWZhY3QgdG8gd2hlcmUgaXQgaXMgcmVhZCBmcm9tLCBhcyBvbmUgcHJvZ3JhbSB3aXRoIHR3byBjYWxsZXJzLgogKgogKiBUaGUgb3BlcmF0b3IgZmV0Y2hlcyBhbiBhcnRpZmFjdCBpbnRvIGl0cyBvd24gY2FjaGUgd2hpbGUgaXQgcGxhbnMsIGFuZCBhIG5vZGUncyBmaWxsIEpvYiBzdGFnZXMgb25lCiAqIGJlc2lkZSB0aGUgZGlyZWN0b3J5IGl0IHdpbGwgb2NjdXB5IGFuZCByZW5hbWVzIGl0IGludG8gcGxhY2UuIFRoZXkgbXVzdCBhZ3JlZSBhYm91dCB3aGF0IGFuIGFydGlmYWN0CiAqIGlzIGFuZCB3aGF0IG1ha2VzIGl0IHdob2xlLCBzbyB0aGUgcGllY2VzIOKAlCBmZXRjaCwgdW5wYWNrLCBsaW5rLCBtYWtlIHBvcnRhYmxlLCBtYXJrLCByZXRhaW4g4oCUIGFyZQogKiBkZWZpbmVkIG9uY2UgaGVyZSBhbmQgZGlmZmVyIG9ubHkgaW4gd2hhdCBhIGNhbGxlciBwYXNzZXMuIFRoZSBzYW1lIGZpbGUgaXMgd2hhdCB0aGUgY29udGFpbmVyIHJ1bnM6CiAqIGl0IGlzIG1vdW50ZWQgaW50byB0aGUgZmlsbCBKb2IgYW5kIHN0YXJ0ZWQgd2l0aCBgbm9kZWAsIHdoaWNoIGlzIHRoZSB3aG9sZSByZWFzb24gdGhpcyBpcyBhIG1vZHVsZQogKiByYXRoZXIgdGhhbiB0aGUgc2hlbGwgaXQgcmVwbGFjZXMuIFRoYXQgc2hlbGwgbmVlZGVkIGBjdXJsYCwgYHVuemlwYCwgYGZpbmRgLCBgbHNgIGFuZCBgbXZgIHRvIGV4aXN0IGluCiAqIHRoZSBmcmFtZXdvcmsgaW1hZ2UsIGFuZCB0aGUgaW1hZ2UgaW5zdGFsbGVkIHR3byBvZiB0aGVtIGZvciBubyBvdGhlciByZWFzb24g4oCUIHNvIHRoZSBkZXBsb3kgcGF0aAogKiBkZXBlbmRlZCBvbiBzaGVsbCB0b29saW5nIHRoYXQgaGFzIG5vdGhpbmcgdG8gZG8gd2l0aCB0aGUgYXJ0aWZhY3QgKEQtNTE4KS4KICoKICogTm90aGluZyBoZXJlIGltcG9ydHMgYW55dGhpbmcgYnV0IGBub2RlOipgLCB3aGljaCBpcyB3aGF0IGxldHMgb25lIGZpbGUgYmUgYm90aCBhIGxpYnJhcnkgYW5kIGEKICogcHJvZ3JhbTogYSBtb3VudGVkIGNvcHkgaGFzIG5vIGBub2RlX21vZHVsZXNgIGFib3ZlIGl0IGFuZCBjb3VsZCByZXNvbHZlIG5vIGRlcGVuZGVuY3kgb2Ygb3Vycy4KICovCmltcG9ydCB7ZXhlY0ZpbGVTeW5jfSBmcm9tICdub2RlOmNoaWxkX3Byb2Nlc3MnOwppbXBvcnQgewogICAgY2xvc2VTeW5jLAogICAgY29weUZpbGVTeW5jLAogICAgY3JlYXRlUmVhZFN0cmVhbSwKICAgIGNyZWF0ZVdyaXRlU3RyZWFtLAogICAgZXhpc3RzU3luYywKICAgIGZzdGF0U3luYywKICAgIG1rZGlyU3luYywKICAgIG9wZW5TeW5jLAogICAgcmVhZGRpclN5bmMsCiAgICByZWFkbGlua1N5bmMsCiAgICByZWFkU3luYywKICAgIHJlYWxwYXRoU3luYywKICAgIHJlbmFtZVN5bmMsCiAgICBybVN5bmMsCiAgICBzdGF0U3luYywKICAgIHN5bWxpbmtTeW5jLAogICAgdW5saW5rU3luYywKICAgIHdyaXRlRmlsZVN5bmMsCn0gZnJvbSAnbm9kZTpmcyc7CmltcG9ydCB7dG1wZGlyfSBmcm9tICdub2RlOm9zJzsKaW1wb3J0IHtkaXJuYW1lLCBpc0Fic29sdXRlLCBqb2luLCByZWxhdGl2ZX0gZnJvbSAnbm9kZTpwYXRoJzsKaW1wb3J0IHtSZWFkYWJsZX0gZnJvbSAnbm9kZTpzdHJlYW0nOwppbXBvcnQge3BpcGVsaW5lfSBmcm9tICdub2RlOnN0cmVhbS9wcm9taXNlcyc7CmltcG9ydCB7ZmlsZVVSTFRvUGF0aH0gZnJvbSAnbm9kZTp1cmwnOwppbXBvcnQge2NyZWF0ZUluZmxhdGVSYXd9IGZyb20gJ25vZGU6emxpYic7Ci8qKiBUaGUgc2V0dGluZ3MgdGhlIGZpbGwgcmVhZHMgZnJvbSBpdHMgZW52aXJvbm1lbnQ6IHRoZSBKb2IncyBjb250cmFjdCwgdW5jaGFuZ2VkIGJ5IHRoaXMgbW9kdWxlLiAqLwpleHBvcnQgY29uc3QgRklMTF9FTlYgPSB7CiAgICByb290OiAnQkxPTkdfQVJUSUZBQ1RfUk9PVCcsCiAgICBpZGVudGl0eTogJ0JMT05HX0FSVElGQUNUX0lERU5USVRZJywKICAgIGtlZXA6ICdCTE9OR19BUlRJRkFDVF9LRUVQJywKICAgIHVybDogJ0JMT05HX0FSVElGQUNUX1VSTCcsCiAgICBwYXRoOiAnQkxPTkdfQVJUSUZBQ1RfUEFUSCcsCn0gYXMgY29uc3Q7CgovKioKICogVGhlIGZpbGUgdGhhdCBtYXJrcyBhbiBhcnRpZmFjdCBhcyB3aG9sZS4KICoKICogT3VyIG93biwgbm90IG9uZSBvZiB0aGUgYXJjaGl2ZSdzOiBpdCBpcyB3cml0dGVuIGFmdGVyIHRoZSB1bnBhY2sgKmFuZCogdGhlIGxpbmsgc3RlcCwgc28gaXRzIHByZXNlbmNlCiAqIGlzIHRoZSBvbmUgdGhpbmcgYSByZWFkZXIgY2FuIHRydXN0IGFib3V0IHRoZSBkaXJlY3RvcnkuCiAqLwpleHBvcnQgY29uc3QgQVJUSUZBQ1RfUkVBRFkgPSAnLmJsb25nLWFydGlmYWN0LXJlYWR5JzsKCi8qKiBSdXNoJ3MgbGluayBzY3JpcHQsIGF0IHRoZSByb290IG9mIGV2ZXJ5IGFydGlmYWN0LCBhbmQgdGhlIHJlYXNvbiB0aGUgbGluayBzdGVwIGlzIGl0cyBvd24gcGllY2UuICovCmNvbnN0IExJTktfU0NSSVBUID0gJ2NyZWF0ZS1saW5rcy5qcyc7CgovKiogQSBmaWxsLCBhcyB0aGUgdHdvIGNhbGxlcnMgYXNrIGZvciBvbmUuICovCmV4cG9ydCBpbnRlcmZhY2UgSUZpbGxSZXF1ZXN0IHsKICAgIC8qKiBUaGUgc291cmNlOiBhIFVSTCB0byBkb3dubG9hZCwgb3IgYSBwYXRoIHRvIGNvcHkuIGBwYXRoYCB3aW5zIHdoZW4gYm90aCBhcmUgZ2l2ZW4uICovCiAgICBzb3VyY2U6IHt1cmw/OiBzdHJpbmc7IHBhdGg/OiBzdHJpbmd9OwogICAgLyoqIFRoZSBkaXJlY3RvcnkgdGhlIGFydGlmYWN0IGJlbG9uZ3MgaW4uICovCiAgICB0YXJnZXQ6IHN0cmluZzsKICAgIC8qKgogICAgICogS2VlcCB0aGUgbmV3ZXN0IGBrZWVwYCBkaXJlY3RvcmllcyB1bmRlciB0aGUgdGFyZ2V0J3MgcGFyZW50LCBhbmQgZGVsZXRlIHRoZSByZXN0LgogICAgICoKICAgICAqIE9taXR0ZWQgYnkgYSBjYWxsZXIgd2hvc2UgbmVpZ2hib3VycyBhcmUgbm90IGl0cyBvd24gdG8gcmVtb3ZlOiB0aGUgYHNoYXJlZGAgYmFja2VuZCdzIHNlZWQgSm9iCiAgICAgKiBmaWxscyBhIGNsYWltIGF0IGl0cyBtb3VudCBwb2ludCwgd2hlcmUgb3RoZXIgZGlyZWN0b3JpZXMgYmVsb25nIHRvIHdob2V2ZXIgbW91bnRzIHRoZSBzYW1lIGNsYWltLgogICAgICovCiAgICBrZWVwPzogbnVtYmVyOwp9CgovKiogVGhlIG9mZnNldHMgb2YgYSB6aXAncyBjZW50cmFsIGRpcmVjdG9yeSwgd2hpY2ggaXMgd2hlcmUgZXZlcnkgZW50cnkgaXMgZGVzY3JpYmVkLiAqLwpjb25zdCBFTkRfT0ZfQ0VOVFJBTF9ESVJFQ1RPUlkgPSAweDA2MDU0YjUwOwpjb25zdCBDRU5UUkFMX0ZJTEVfSEVBREVSID0gMHgwMjAxNGI1MDsKCi8qKgogKiBXaGVyZSBhIHppcCdzIGNlbnRyYWwgZGlyZWN0b3J5IHJlY29yZCBzdGFydHMsIGZvdW5kIGZyb20gdGhlIGVuZCBvZiB0aGUgYnl0ZXMgZ2l2ZW4uCiAqCiAqIFRoZSBjYWxsZXIgcGFzc2VzIHRoZSBhcmNoaXZlJ3MgKnRhaWwqIHJhdGhlciB0aGFuIHRoZSBhcmNoaXZlLCBzbyB0aGF0IGZpbmRpbmcgdGhlIHJlY29yZCBkb2VzIG5vdCBtZWFuCiAqIHJlYWRpbmcgc2l4IGh1bmRyZWQgbWVnYWJ5dGVzIHRvIGxvb2sgYXQgdGhlIGxhc3QgZmV3IGJ5dGVzIG9mIHRoZW0uCiAqLwpjb25zdCBlbmRPZkNlbnRyYWxEaXJlY3RvcnkgPSAodGFpbDogQnVmZmVyKTogbnVtYmVyID0+IHsKICAgIGZvciAobGV0IGF0ID0gdGFpbC5sZW5ndGggLSAyMjsgYXQgPj0gMDsgYXQtLSkgewogICAgICAgIGlmICh0YWlsLnJlYWRVSW50MzJMRShhdCkgPT09IEVORF9PRl9DRU5UUkFMX0RJUkVDVE9SWSkgcmV0dXJuIGF0OwogICAgfQogICAgdGhyb3cgbmV3IEVycm9yKCd0aGUgYXJjaGl2ZSBoYXMgbm8gZW5kIG9mIGNlbnRyYWwgZGlyZWN0b3J5IHJlY29yZDogaXQgaXMgbm90IGEgemlwJyk7Cn07CgovKiogVGhlIGJ5dGVzIGF0IGFuIG9mZnNldCBvZiBhbiBvcGVuIGZpbGUsIHdoaWNoIGlzIGhvdyB0aGlzIHJlYWRlciB3YWxrcyBhbiBhcmNoaXZlIGl0IG5ldmVyIGhvbGRzLiAqLwpjb25zdCByZWFkQXQgPSAoZmQ6IG51bWJlciwgb2Zmc2V0OiBudW1iZXIsIGxlbmd0aDogbnVtYmVyKTogQnVmZmVyID0+IHsKICAgIGNvbnN0IGJ5dGVzID0gQnVmZmVyLmFsbG9jKGxlbmd0aCk7CiAgICByZWFkU3luYyhmZCwgYnl0ZXMsIDAsIGxlbmd0aCwgb2Zmc2V0KTsKICAgIHJldHVybiBieXRlczsKfTsKCi8qKgogKiBVbnBhY2sgYSB6aXAgaW50byBhIGRpcmVjdG9yeSB0aGF0IGlzIGFscmVhZHkgdGhlcmUuCiAqCiAqIFdyaXR0ZW4gaGVyZSByYXRoZXIgdGhhbiB0YWtlbiBmcm9tIGEgbGlicmFyeSwgYmVjYXVzZSB0aGUgY29weSBvZiB0aGlzIGZpbGUgdGhhdCBydW5zIGluc2lkZSBhIGZpbGwgSm9iCiAqIGlzIG1vdW50ZWQgaW50byBhIGRpcmVjdG9yeSB3aXRoIG5vIGBub2RlX21vZHVsZXNgIGFib3ZlIGl0OiBhbnkgZGVwZW5kZW5jeSB3b3VsZCBoYXZlIHRvIGJlIGluc3RhbGxlZAogKiBpbnRvIHRoZSBmcmFtZXdvcmsgaW1hZ2UsIHdoaWNoIGlzIHRoZSBjb3VwbGluZyB0aGlzIG1vZHVsZSBleGlzdHMgdG8gZW5kLiBXaGF0IGEgemlwIG5lZWRzIGlzIGEKICogY2VudHJhbCBkaXJlY3Rvcnkgd2FsayBhbmQgYHpsaWJgJ3MgaW5mbGF0ZSwgYm90aCBvZiB3aGljaCBhcmUgaGVyZS4KICoKICogUmVmdXNlZCByYXRoZXIgdGhhbiBndWVzc2VkIGF0OiBhbiBlbmNyeXB0ZWQgZW50cnksIGFuIGVudHJ5IHRoYXQgbGVhdmVzIHRoZSBkaXJlY3RvcnksIGFuZCBhIHppcDY0CiAqIGVudHJ5LCB3aG9zZSBzaXplcyBsaXZlIGluIGFuIGV4dHJhIGZpZWxkIHRoaXMgcmVhZGVyIGRvZXMgbm90IHJlYWQuIEEgc3VpdGUgYXJ0aWZhY3QgaXMgYSBkZXBsb3kKICogb3V0cHV0IG9mIGEgZmV3IGh1bmRyZWQgbWVnYWJ5dGVzLCBzbyBub25lIG9mIHRoZSB0aHJlZSBpcyBhIGNhc2UgYSByZWxlYXNlIGhhcyB0byBzdXJ2aXZlLgogKgogKiBTdHJlYW1lZCBlbnRyeSBieSBlbnRyeSwgYW5kIHRoYXQgaXMgbm90IGEgcHJlZmVyZW5jZTogdGhlIHN1aXRlIGFydGlmYWN0IGluIHRoaXMgcmVwb3NpdG9yeSBpcyA2NTMgTUIsCiAqIHdoaWxlIHRoZSBmaWxsIEpvYiB0aGF0IHVucGFja3MgaXQgcnVucyB1bmRlciBhIDUxMiBNaUIgbGltaXQuIFJlYWRpbmcgdGhlIGFyY2hpdmUgaW50byBtZW1vcnkgaXMgd2hhdAogKiB0aGUgZmlyc3QgdmVyc2lvbiBvZiB0aGlzIGRpZCDigJQgdGhlIHBvZHMgd2VyZSBPT01LaWxsZWQgcGFydC13YXkgdGhyb3VnaCB0aGUgdW5wYWNrLCBsZWF2aW5nIGEKICogaGFsZi13cml0dGVuIHN0YWdpbmcgZGlyZWN0b3J5IG9uIGVhY2ggbm9kZSBhbmQgZXZlcnkgcmVhZGVyIHdhaXRpbmcgZm9yIGFuIGlkZW50aXR5IHRoYXQgbmV2ZXIKICogYXBwZWFyZWQsIGFuZCBhIGZpbGwgdGhhdCBkaWVzIGxpa2UgdGhhdCBsb29rcyBsaWtlIGEgZmlsbCB0aGF0IHN1Y2NlZWRlZCB1bnRpbCBzb21lYm9keSByZWFkcyB0aGUKICogbm9kZSAoZm91bmQgaW4gdGhlIGRldiBjbHVzdGVyLCBULTMxOCkuCiAqLwpleHBvcnQgY29uc3QgdW5wYWNrWmlwID0gYXN5bmMgKGFyY2hpdmU6IHN0cmluZywgdGFyZ2V0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHsKICAgIGNvbnN0IGZkID0gb3BlblN5bmMoYXJjaGl2ZSwgJ3InKTsKICAgIHRyeSB7CiAgICAgICAgY29uc3Qgc2l6ZSA9IGZzdGF0U3luYyhmZCkuc2l6ZTsKICAgICAgICBjb25zdCB0YWlsTGVuZ3RoID0gTWF0aC5taW4oc2l6ZSwgMjIgKyAweGZmZmYpOwogICAgICAgIGNvbnN0IGVuZCA9CiAgICAgICAgICAgIHNpemUgLSB0YWlsTGVuZ3RoICsgZW5kT2ZDZW50cmFsRGlyZWN0b3J5KHJlYWRBdChmZCwgc2l6ZSAtIHRhaWxMZW5ndGgsIHRhaWxMZW5ndGgpKTsKICAgICAgICBjb25zdCBjb3VudCA9IHJlYWRBdChmZCwgZW5kICsgMTAsIDIpLnJlYWRVSW50MTZMRSgwKTsKICAgICAgICBjb25zdCBkaXJlY3RvcnlTaXplID0gcmVhZEF0KGZkLCBlbmQgKyAxMiwgNCkucmVhZFVJbnQzMkxFKDApOwogICAgICAgIGNvbnN0IGRpcmVjdG9yeVN0YXJ0ID0gcmVhZEF0KGZkLCBlbmQgKyAxNiwgNCkucmVhZFVJbnQzMkxFKDApOwogICAgICAgIC8vIFRoZSBkaXJlY3RvcnkgaXMgdGhlIG9uZSBwYXJ0IHRoYXQgaXMgcmVhZCB3aG9sZSwgYW5kIGl0IGhvbGRzIGEgZmV3IGRvemVuIGJ5dGVzIHBlciBlbnRyeS4KICAgICAgICBpZiAoCiAgICAgICAgICAgIGRpcmVjdG9yeVNpemUgPT09IDB4ZmZmZmZmZmYgfHwKICAgICAgICAgICAgZGlyZWN0b3J5U3RhcnQgPT09IDB4ZmZmZmZmZmYgfHwKICAgICAgICAgICAgZGlyZWN0b3J5U3RhcnQgKyBkaXJlY3RvcnlTaXplID4gc2l6ZQogICAgICAgICkgewogICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoJ3RoZSBhcmNoaXZlIGlzIGEgemlwNjQgb25lLCBvciBzYXlzIGl0cyBkaXJlY3RvcnkgaXMgb3V0c2lkZSBpdCcpOwogICAgICAgIH0KICAgICAgICBjb25zdCBkaXJlY3RvcnkgPSByZWFkQXQoZmQsIGRpcmVjdG9yeVN0YXJ0LCBkaXJlY3RvcnlTaXplKTsKICAgICAgICBjb25zdCB3aGVyZSA9IGAke3RhcmdldH0vYDsKICAgICAgICBsZXQgY3Vyc29yID0gMDsKICAgICAgICBmb3IgKGxldCBpbmRleCA9IDA7IGluZGV4IDwgY291bnQ7IGluZGV4KyspIHsKICAgICAgICAgICAgaWYgKGRpcmVjdG9yeS5yZWFkVUludDMyTEUoY3Vyc29yKSAhPT0gQ0VOVFJBTF9GSUxFX0hFQURFUikgewogICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKAogICAgICAgICAgICAgICAgICAgICd0aGUgYXJjaGl2ZSBzYXlzIGl0IGhvbGRzIG1vcmUgZW50cmllcyB0aGFuIGl0cyBjZW50cmFsIGRpcmVjdG9yeSBkb2VzJywKICAgICAgICAgICAgICAgICk7CiAgICAgICAgICAgIH0KICAgICAgICAgICAgY29uc3QgZmxhZ3MgPSBkaXJlY3RvcnkucmVhZFVJbnQxNkxFKGN1cnNvciArIDgpOwogICAgICAgICAgICBjb25zdCBtZXRob2QgPSBkaXJlY3RvcnkucmVhZFVJbnQxNkxFKGN1cnNvciArIDEwKTsKICAgICAgICAgICAgY29uc3QgY29tcHJlc3NlZFNpemUgPSBkaXJlY3RvcnkucmVhZFVJbnQzMkxFKGN1cnNvciArIDIwKTsKICAgICAgICAgICAgY29uc3QgdW5jb21wcmVzc2VkU2l6ZSA9IGRpcmVjdG9yeS5yZWFkVUludDMyTEUoY3Vyc29yICsgMjQpOwogICAgICAgICAgICBjb25zdCBuYW1lTGVuZ3RoID0gZGlyZWN0b3J5LnJlYWRVSW50MTZMRShjdXJzb3IgKyAyOCk7CiAgICAgICAgICAgIGNvbnN0IGV4dHJhTGVuZ3RoID0gZGlyZWN0b3J5LnJlYWRVSW50MTZMRShjdXJzb3IgKyAzMCk7CiAgICAgICAgICAgIGNvbnN0IGNvbW1lbnRMZW5ndGggPSBkaXJlY3RvcnkucmVhZFVJbnQxNkxFKGN1cnNvciArIDMyKTsKICAgICAgICAgICAgY29uc3QgbG9jYWwgPSBkaXJlY3RvcnkucmVhZFVJbnQzMkxFKGN1cnNvciArIDQyKTsKICAgICAgICAgICAgY29uc3QgbmFtZSA9IGRpcmVjdG9yeS50b1N0cmluZygndXRmOCcsIGN1cnNvciArIDQ2LCBjdXJzb3IgKyA0NiArIG5hbWVMZW5ndGgpOwogICAgICAgICAgICBjdXJzb3IgKz0gNDYgKyBuYW1lTGVuZ3RoICsgZXh0cmFMZW5ndGggKyBjb21tZW50TGVuZ3RoOwogICAgICAgICAgICAvLyBBIGRpcmVjdG9yeSBlbnRyeTogdGhlIGZpbGVzIHRoYXQgbmVlZCBpdCBjcmVhdGUgaXQgb24gdGhlIHdheSBpbi4KICAgICAgICAgICAgaWYgKG5hbWUuZW5kc1dpdGgoJy8nKSkgY29udGludWU7CiAgICAgICAgICAgIGlmIChmbGFncyAmIDB4MSkgdGhyb3cgbmV3IEVycm9yKGAke25hbWV9IGlzIGVuY3J5cHRlZCwgd2hpY2ggdGhpcyByZWFkZXIgZG9lcyBub3QgcmVhZGApOwogICAgICAgICAgICBpZiAoCiAgICAgICAgICAgICAgICBjb21wcmVzc2VkU2l6ZSA9PT0gMHhmZmZmZmZmZiB8fAogICAgICAgICAgICAgICAgdW5jb21wcmVzc2VkU2l6ZSA9PT0gMHhmZmZmZmZmZiB8fAogICAgICAgICAgICAgICAgbG9jYWwgPT09IDB4ZmZmZmZmZmYKICAgICAgICAgICAgKSB7CiAgICAgICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYCR7bmFtZX0gaXMgYSB6aXA2NCBlbnRyeSwgd2hpY2ggdGhpcyByZWFkZXIgZG9lcyBub3QgcmVhZGApOwogICAgICAgICAgICB9CiAgICAgICAgICAgIGNvbnN0IHdyaXR0ZW4gPSBqb2luKHRhcmdldCwgbmFtZSk7CiAgICAgICAgICAgIGlmICghd3JpdHRlbi5zdGFydHNXaXRoKHdoZXJlKSkgewogICAgICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGAke25hbWV9IHdvdWxkIGJlIHVucGFja2VkIG91dHNpZGUgJHt0YXJnZXR9YCk7CiAgICAgICAgICAgIH0KICAgICAgICAgICAgaWYgKG1ldGhvZCAhPT0gMCAmJiBtZXRob2QgIT09IDgpIHsKICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcigKICAgICAgICAgICAgICAgICAgICBgJHtuYW1lfSBpcyBjb21wcmVzc2VkIHdpdGggbWV0aG9kICR7bWV0aG9kfSwgd2hpY2ggdGhpcyByZWFkZXIgZG9lcyBub3QgcmVhZGAsCiAgICAgICAgICAgICAgICApOwogICAgICAgICAgICB9CiAgICAgICAgICAgIG1rZGlyU3luYyhqb2luKHdyaXR0ZW4sICcuLicpLCB7cmVjdXJzaXZlOiB0cnVlfSk7CiAgICAgICAgICAgIGlmIChjb21wcmVzc2VkU2l6ZSA9PT0gMCkgewogICAgICAgICAgICAgICAgd3JpdGVGaWxlU3luYyh3cml0dGVuLCAnJyk7CiAgICAgICAgICAgICAgICBjb250aW51ZTsKICAgICAgICAgICAgfQogICAgICAgICAgICAvLyBUaGUgbG9jYWwgaGVhZGVyIHJlcGVhdHMgdGhlIG5hbWUgYW5kIGl0cyBleHRyYSBmaWVsZCwgYW5kIHRoZSBkYXRhIGZvbGxvd3MgdGhlbS4gQSBzdHJlYW0ncwogICAgICAgICAgICAvLyByYW5nZSBlbmRzIG9uIHRoZSBsYXN0IGJ5dGUgcmF0aGVyIHRoYW4gb25lIHBhc3QgaXQuCiAgICAgICAgICAgIGNvbnN0IGhlYWRlciA9IHJlYWRBdChmZCwgbG9jYWwsIDMwKTsKICAgICAgICAgICAgY29uc3QgZnJvbSA9IGxvY2FsICsgMzAgKyBoZWFkZXIucmVhZFVJbnQxNkxFKDI2KSArIGhlYWRlci5yZWFkVUludDE2TEUoMjgpOwogICAgICAgICAgICBjb25zdCBwYWNrZWQgPSBjcmVhdGVSZWFkU3RyZWFtKGFyY2hpdmUsIHsKICAgICAgICAgICAgICAgIHN0YXJ0OiBmcm9tLAogICAgICAgICAgICAgICAgZW5kOiBmcm9tICsgY29tcHJlc3NlZFNpemUgLSAxLAogICAgICAgICAgICB9KTsKICAgICAgICAgICAgaWYgKG1ldGhvZCA9PT0gMCkgYXdhaXQgcGlwZWxpbmUocGFja2VkLCBjcmVhdGVXcml0ZVN0cmVhbSh3cml0dGVuKSk7CiAgICAgICAgICAgIGVsc2UgYXdhaXQgcGlwZWxpbmUocGFja2VkLCBjcmVhdGVJbmZsYXRlUmF3KCksIGNyZWF0ZVdyaXRlU3RyZWFtKHdyaXR0ZW4pKTsKICAgICAgICB9CiAgICB9IGZpbmFsbHkgewogICAgICAgIGNsb3NlU3luYyhmZCk7CiAgICB9Cn07CgovKioKICogUnVuIFJ1c2gncyBsaW5rIHNjcmlwdCBvdmVyIHRoZSB0cmVlIHRoYXQgaXMgYXQgYHRhcmdldGAgbm93LCBpZiBpdCBjYXJyaWVzIG9uZS4KICoKICogVGhlIHNjcmlwdCByZXBsYWNlcyB0aGUgYG5vZGVfbW9kdWxlc2AgYSBkZXBsb3kgY291bGQgbm90IGFyY2hpdmU6IGEgdGFyIG9yIGEgemlwIGNhbm5vdCBob2xkIHN5bWxpbmtzLAogKiBzbyBgcnVzaCBkZXBsb3lgIHdyaXRlcyB0aGUgbGlua3MgYXMgYSBzY3JpcHQgYW5kIHNvbWV0aGluZyBoYXMgdG8gcnVuIGl0IHdoZXJlIHRoZSBhcnRpZmFjdCBsYW5kcy4KICogYHByb2Nlc3MuZXhlY1BhdGhgIHJhdGhlciB0aGFuIGBub2RlYCwgYmVjYXVzZSB0aGUgcnVudGltZSB0aGF0IHN0YXJ0ZWQgdGhpcyBwcm9ncmFtIGlzIGNlcnRhaW5seQogKiB0aGVyZSBhbmQgb25lIG9uIGBQQVRIYCBtYXkgbm90IGJlLgogKi8KZXhwb3J0IGNvbnN0IGxpbmtBdCA9ICh0YXJnZXQ6IHN0cmluZyk6IHZvaWQgPT4gewogICAgaWYgKCFleGlzdHNTeW5jKGpvaW4odGFyZ2V0LCBMSU5LX1NDUklQVCkpKSByZXR1cm47CiAgICBleGVjRmlsZVN5bmMocHJvY2Vzcy5leGVjUGF0aCwgW0xJTktfU0NSSVBULCAnY3JlYXRlJ10sIHtjd2Q6IHRhcmdldCwgc3RkaW86ICdpbmhlcml0J30pOwp9OwoKLyoqCiAqIFJld3JpdGUgZXZlcnkgYWJzb2x1dGUgbGluayB1bmRlciBgdGFyZ2V0YCBhcyBhIHJlbGF0aXZlIG9uZS4KICoKICogVGhlIGxpbmsgc2NyaXB0IGNvbXB1dGVzIGl0cyB0YXJnZXRzIGZyb20gdGhlIGRpcmVjdG9yeSBpdCBydW5zIGluLCBzbyBhIHRyZWUgbGlua2VkIGF0CiAqIGAvdmFyL2xpYi9ibG9uZy9zdWl0ZXMvPHN1aXRlPi88aWRlbnRpdHk+YCBjYXJyaWVzIGxpbmtzIG5hbWluZyB0aGF0IHBhdGgg4oCUIGFuZCBhIHJlYWRlciB0aGF0IG1vdW50cyB0aGUKICogZGlyZWN0b3J5IGFueXdoZXJlIGVsc2UgaGFzIGh1bmRyZWRzIG9mIGRhbmdsaW5nIGxpbmtzIGFuZCBkaWVzIG9uIGl0cyBmaXJzdCBpbXBvcnQgKEYtNDQ5KS4gRXZlcnkKICogbGluaydzIHRhcmdldCBpcyBpbnNpZGUgdGhlIGFydGlmYWN0LCB3aGljaCB3YXMgY2hlY2tlZCBhY3Jvc3MgYSB3aG9sZSB0cmVlIGluIGEgbGl2ZSBjbHVzdGVyLCBzbyBhCiAqIHJlbGF0aXZlIGxpbmsgaXMgZXF1aXZhbGVudCBhbmQgcG9zaXRpb24taW5kZXBlbmRlbnQuCiAqCiAqIEEgc3ltbGlua2VkIGRpcmVjdG9yeSBpcyBub3QgZGVzY2VuZGVkIGludG8g4oCUIGByZWFkZGlyYCByZXBvcnRzIGl0IGFzIGEgbGluaywgbm90IGFzIGEgZGlyZWN0b3J5IOKAlAogKiB3aGljaCBtYXR0ZXJzIGJlY2F1c2UgYSBsaW5rIHBvaW50aW5nIGludG8gYSBgbm9kZV9tb2R1bGVzYCB0cmVlIHdvdWxkIG90aGVyd2lzZSBiZSB3YWxrZWQgYSBzZWNvbmQKICogdGltZS4KICovCmV4cG9ydCBjb25zdCByZWxhdGl2aXplTGlua3MgPSAodGFyZ2V0OiBzdHJpbmcpOiBudW1iZXIgPT4gewogICAgbGV0IHJld3JpdHRlbiA9IDA7CiAgICBjb25zdCB3YWxrID0gKGRpcmVjdG9yeTogc3RyaW5nKTogdm9pZCA9PiB7CiAgICAgICAgZm9yIChjb25zdCBlbnRyeSBvZiByZWFkZGlyU3luYyhkaXJlY3RvcnksIHt3aXRoRmlsZVR5cGVzOiB0cnVlfSkpIHsKICAgICAgICAgICAgY29uc3QgcGF0aCA9IGpvaW4oZGlyZWN0b3J5LCBlbnRyeS5uYW1lKTsKICAgICAgICAgICAgaWYgKGVudHJ5LmlzU3ltYm9saWNMaW5rKCkpIHsKICAgICAgICAgICAgICAgIGNvbnN0IHBvaW50c0F0ID0gcmVhZGxpbmtTeW5jKHBhdGgpOwogICAgICAgICAgICAgICAgaWYgKGlzQWJzb2x1dGUocG9pbnRzQXQpKSB7CiAgICAgICAgICAgICAgICAgICAgdW5saW5rU3luYyhwYXRoKTsKICAgICAgICAgICAgICAgICAgICBzeW1saW5rU3luYyhyZWxhdGl2ZShkaXJlY3RvcnksIHBvaW50c0F0KSwgcGF0aCk7CiAgICAgICAgICAgICAgICAgICAgcmV3cml0dGVuKys7CiAgICAgICAgICAgICAgICB9CiAgICAgICAgICAgIH0gZWxzZSBpZiAoZW50cnkuaXNEaXJlY3RvcnkoKSkgd2FsayhwYXRoKTsKICAgICAgICB9CiAgICB9OwogICAgd2Fsayh0YXJnZXQpOwogICAgcmV0dXJuIHJld3JpdHRlbjsKfTsKCi8qKgogKiBDb3B5IGEgZGlyZWN0b3J5J3MgY29udGVudHMgaW50byBhbm90aGVyLCB3aGljaCBpcyB3aGF0IGEgYHBhdGhgIGFydGlmYWN0IGlzLgogKgogKiBFbnRyeSBieSBlbnRyeSByYXRoZXIgdGhhbiBpbiBvbmUgY2FsbCwgYmVjYXVzZSB0aGUgYXJ0aWZhY3QncyAqY29udGVudHMqIGFyZSB3YW50ZWQgYXQgdGhlIHRhcmdldCBhbmQKICogbm90IHRoZSBhcnRpZmFjdCBkaXJlY3RvcnkgaXRzZWxmOiBgY3AgLVIg4oCmLy4g4oCmL2Agd2FzIHRoZSBzaGVsbCdzIHNwZWxsaW5nIG9mIHRoZSBzYW1lIHRoaW5nLgogKi8KZXhwb3J0IGNvbnN0IGNvcHlUcmVlID0gKHNvdXJjZTogc3RyaW5nLCB0YXJnZXQ6IHN0cmluZyk6IHZvaWQgPT4gewogICAgZm9yIChjb25zdCBlbnRyeSBvZiByZWFkZGlyU3luYyhzb3VyY2UpKSB7CiAgICAgICAgY29uc3QgZnJvbSA9IGpvaW4oc291cmNlLCBlbnRyeSk7CiAgICAgICAgY29uc3QgdG8gPSBqb2luKHRhcmdldCwgZW50cnkpOwogICAgICAgIGlmIChzdGF0U3luYyhmcm9tKS5pc0RpcmVjdG9yeSgpKSB7CiAgICAgICAgICAgIG1rZGlyU3luYyh0bywge3JlY3Vyc2l2ZTogdHJ1ZX0pOwogICAgICAgICAgICBjb3B5VHJlZShmcm9tLCB0byk7CiAgICAgICAgfSBlbHNlIHsKICAgICAgICAgICAgY29weUZpbGVTeW5jKGZyb20sIHRvKTsKICAgICAgICB9CiAgICB9Cn07CgovKioKICogRG93bmxvYWQgYSBVUkwgdG8gYSBmaWxlLgogKgogKiBgZmV0Y2hgIHJhdGhlciB0aGFuIGEgcmVxdWVzdCBsaWJyYXJ5OiBpdCBpcyBpbiB0aGUgcnVudGltZSwgYW5kIGEgbW91bnRlZCBjb3B5IG9mIHRoaXMgbW9kdWxlIGNvdWxkCiAqIHJlc29sdmUgbm90aGluZyBlbHNlLiBTdHJlYW1lZCByYXRoZXIgdGhhbiBidWZmZXJlZCwgYmVjYXVzZSBhIHN1aXRlIGFydGlmYWN0IGlzIGh1bmRyZWRzIG9mIG1lZ2FieXRlcwogKiBhbmQgdGhlIGZpbGwgcnVucyBvbiBhIG5vZGUgdGhhdCBoYXMgb25lIGRpcmVjdG9yeSdzIHdvcnRoIG9mIHJvb20gdG8gc3BhcmUsIG5vdCB0d28uCiAqLwpleHBvcnQgY29uc3QgZG93bmxvYWQgPSBhc3luYyAodXJsOiBzdHJpbmcsIHRvOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+ID0+IHsKICAgIGNvbnN0IGFuc3dlciA9IGF3YWl0IGZldGNoKHVybCk7CiAgICBpZiAoIWFuc3dlci5vayB8fCAhYW5zd2VyLmJvZHkpIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYHRoZSBhcnRpZmFjdCBhdCAke3VybH0gYW5zd2VyZWQgJHthbnN3ZXIuc3RhdHVzfSAke2Fuc3dlci5zdGF0dXNUZXh0fWApOwogICAgfQogICAgLy8gVGhlIGJvZHkgaXMgYW4gYXN5bmMgaXRlcmF0b3IgYXQgcnVudGltZTsgdGhlIHR5cGUgb25seSBjYXJyaWVzIHRoYXQgdGhyb3VnaCBgbm9kZTpzdHJlYW0vd2ViYCwKICAgIC8vIHdoaWNoIGlzIGEgY2FzdCB0aGlzIGZpbGUgd291bGQgcmF0aGVyIG5vdCBkZXBlbmQgb24uCiAgICBjb25zdCBib2R5ID0gYW5zd2VyLmJvZHkgYXMgdW5rbm93biBhcyBBc3luY0l0ZXJhYmxlPFVpbnQ4QXJyYXk+OwogICAgYXdhaXQgcGlwZWxpbmUoUmVhZGFibGUuZnJvbShib2R5KSwgY3JlYXRlV3JpdGVTdHJlYW0odG8pKTsKfTsKCi8qKgogKiBQbGFjZSBhbiBhcnRpZmFjdCBpbiB0aGUgZGlyZWN0b3J5IGl0IHdpbGwgYmUgcmVhZCBmcm9tLgogKgogKiBUaGUgbWFya2VyIGNvbWVzIG9mZiBmaXJzdCBhbmQgZ29lcyBvbiBsYXN0OiBpdCBpcyB3aGF0IHNheXMgdGhlIGFydGlmYWN0IGlzIHdob2xlLiBBIGRpcmVjdG9yeSBpcwogKiByZXBsYWNlZCByYXRoZXIgdGhhbiBtZXJnZWQsIHdoaWNoZXZlciB3YXkgdGhlIGFydGlmYWN0IGFycml2ZXMsIHNvIGEgcmVydW4gY2Fubm90IGtlZXAgYW4gb2xkZXIgZmlsZQogKiBvciBsZWF2ZSB0aGUgbGluayBzY3JpcHQgbG9va2luZyBhdCBsaW5rcyBpdCB3aWxsIG5vdCBjcmVhdGUgYWdhaW4g4oCUIHdoaWNoIGlzIHdoeSB0aGUgdGFyZ2V0IGlzIGVtcHRpZWQKICogcmF0aGVyIHRoYW4gd3JpdHRlbiBpbnRvLgogKi8KZXhwb3J0IGNvbnN0IGZpbGxBcnRpZmFjdCA9IGFzeW5jIChyZXF1ZXN0OiBJRmlsbFJlcXVlc3QpOiBQcm9taXNlPHZvaWQ+ID0+IHsKICAgIGNvbnN0IHtzb3VyY2UsIHRhcmdldH0gPSByZXF1ZXN0OwogICAgcm1TeW5jKGpvaW4odGFyZ2V0LCBBUlRJRkFDVF9SRUFEWSksIHtmb3JjZTogdHJ1ZX0pOwogICAgcm1TeW5jKHRhcmdldCwge3JlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWV9KTsKICAgIG1rZGlyU3luYyh0YXJnZXQsIHtyZWN1cnNpdmU6IHRydWV9KTsKICAgIGlmIChzb3VyY2UucGF0aCkgewogICAgICAgIGNvcHlUcmVlKHNvdXJjZS5wYXRoLCB0YXJnZXQpOwogICAgfSBlbHNlIGlmIChzb3VyY2UudXJsKSB7CiAgICAgICAgY29uc3QgYXJjaGl2ZSA9IGpvaW4odG1wZGlyKCksIGBibG9uZy1hcnRpZmFjdC0ke3Byb2Nlc3MucGlkfS56aXBgKTsKICAgICAgICB0cnkgewogICAgICAgICAgICBhd2FpdCBkb3dubG9hZChzb3VyY2UudXJsLCBhcmNoaXZlKTsKICAgICAgICAgICAgYXdhaXQgdW5wYWNrWmlwKGFyY2hpdmUsIHRhcmdldCk7CiAgICAgICAgfSBmaW5hbGx5IHsKICAgICAgICAgICAgcm1TeW5jKGFyY2hpdmUsIHtmb3JjZTogdHJ1ZX0pOwogICAgICAgIH0KICAgIH0gZWxzZSB7CiAgICAgICAgdGhyb3cgbmV3IEVycm9yKCd0aGUgYXJ0aWZhY3QgbmFtZXMgbmVpdGhlciBhIHVybCB0byBmZXRjaCBub3IgYSBwYXRoIHRvIHJlYWQnKTsKICAgIH0KICAgIGxpbmtBdCh0YXJnZXQpOwogICAgcmVsYXRpdml6ZUxpbmtzKHRhcmdldCk7CiAgICB3cml0ZUZpbGVTeW5jKGpvaW4odGFyZ2V0LCBBUlRJRkFDVF9SRUFEWSksICcnKTsKICAgIGlmIChyZXF1ZXN0LmtlZXAgIT09IHVuZGVmaW5lZCkga2VlcE5ld2VzdChkaXJuYW1lKHRhcmdldCksIHJlcXVlc3Qua2VlcCk7Cn07CgovKioKICogS2VlcCB0aGUgbmV3ZXN0IGRpcmVjdG9yaWVzIHVuZGVyIGByb290YCwgYW5kIGRlbGV0ZSB0aGUgcmVzdC4KICoKICogQnkgbW9kaWZpY2F0aW9uIHRpbWUgcmF0aGVyIHRoYW4gYnkgbmFtZTogYW4gaWRlbnRpdHkgaXMgYSBkaWdlc3Qgb3IgYSBzdGFtcCwgYW5kIG5laXRoZXIgb3JkZXJzIOKAlCAidGhlCiAqIGxhc3QgdGhyZWUiIGlzIGEgcXVlc3Rpb24gdGhlIG5vZGUgY2FuIGFuc3dlciBvbiBpdHMgb3duLiBUaGUgY2FsbGVyIHBhc3NlcyB0aGUgY291bnQgaXQgd2FudHMgdG8gZW5kIHVwCiAqIHdpdGgsIGFuZCB0aGUgZGlyZWN0b3J5IGp1c3Qgd3JpdHRlbiBpcyBhbW9uZyB0aGVtLCBiZWNhdXNlIGEgZmlsbCBoYXMgb25seSByZW5hbWVkIGl0IGludG8gcGxhY2UuCiAqLwpleHBvcnQgY29uc3Qga2VlcE5ld2VzdCA9IChyb290OiBzdHJpbmcsIGtlZXA6IG51bWJlcik6IHZvaWQgPT4gewogICAgY29uc3QgZGlyZWN0b3JpZXMgPSByZWFkZGlyU3luYyhyb290LCB7d2l0aEZpbGVUeXBlczogdHJ1ZX0pCiAgICAgICAgLmZpbHRlcihlbnRyeSA9PiBlbnRyeS5pc0RpcmVjdG9yeSgpKQogICAgICAgIC5tYXAoZW50cnkgPT4gKHtuYW1lOiBlbnRyeS5uYW1lLCBhdDogc3RhdFN5bmMoam9pbihyb290LCBlbnRyeS5uYW1lKSkubXRpbWVNc30pKQogICAgICAgIC5zb3J0KChsZWZ0LCByaWdodCkgPT4gcmlnaHQuYXQgLSBsZWZ0LmF0KTsKICAgIGZvciAoY29uc3Qge25hbWV9IG9mIGRpcmVjdG9yaWVzLnNsaWNlKGtlZXApKSB7CiAgICAgICAgcm1TeW5jKGpvaW4ocm9vdCwgbmFtZSksIHtyZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlfSk7CiAgICB9Cn07CgovKiogU3RhZ2luZyBkaXJlY3RvcmllcyBhbiBpbnRlcnJ1cHRlZCBmaWxsIGxlZnQgYmVoaW5kLCB3aGljaCBub3RoaW5nIGVsc2Ugd291bGQgZXZlciBjb2xsZWN0LiAqLwpleHBvcnQgY29uc3QgZHJvcFN0YWxlU3RhZ2luZyA9IChyb290OiBzdHJpbmcsIG9sZGVyVGhhbk1zID0gNjAgKiA2MCAqIDEwMDApOiB2b2lkID0+IHsKICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7CiAgICBmb3IgKGNvbnN0IGVudHJ5IG9mIHJlYWRkaXJTeW5jKHJvb3QsIHt3aXRoRmlsZVR5cGVzOiB0cnVlfSkpIHsKICAgICAgICBpZiAoIWVudHJ5LmlzRGlyZWN0b3J5KCkgfHwgIWVudHJ5Lm5hbWUuc3RhcnRzV2l0aCgnLnN0YWdpbmctJykpIGNvbnRpbnVlOwogICAgICAgIGlmIChub3cgLSBzdGF0U3luYyhqb2luKHJvb3QsIGVudHJ5Lm5hbWUpKS5tdGltZU1zIDwgb2xkZXJUaGFuTXMpIGNvbnRpbnVlOwogICAgICAgIHJtU3luYyhqb2luKHJvb3QsIGVudHJ5Lm5hbWUpLCB7cmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZX0pOwogICAgfQp9OwoKLyoqCiAqIFRoZSBmaWxsIGEgbm9kZSBydW5zLCBkcml2ZW4gYnkgdGhlIGVudmlyb25tZW50IHRoZSBKb2Igc2V0cy4KICoKICogQSAqc3RhZ2VkKiBmaWxsOiB0aGUgYXJ0aWZhY3QgaXMgdW5wYWNrZWQsIGxpbmtlZCBhbmQgbWFkZSBwb3J0YWJsZSBiZXNpZGUgd2hlcmUgaXQgYmVsb25ncywgYW5kIHRoZW4KICogbW92ZWQgaW50byBwbGFjZSBpbiBvbmUgcmVuYW1lLCBzbyBhIHJlYWRlciBzZWVzIGVpdGhlciBub3RoaW5nIG9yIGEgd2hvbGUgdHJlZSDigJQgd2hpY2ggaXMgd2hhdCBtYWtlcyBhbgogKiBpbi1wbGFjZSByZXdyaXRlLCBhbmQgdGhlIG5vdGlmaWNhdGlvbiBhIHJlYWRlciB3b3VsZCBuZWVkIHRvIHN1cnZpdmUgb25lLCB1bm5lY2Vzc2FyeSAoRC00NjgpLiBMaW5raW5nCiAqIGJlZm9yZSB0aGUgbW92ZSBpcyB3aGF0IHRoZSByZWxhdGl2ZSBsaW5rcyBtYWtlIHBvc3NpYmxlOiBhIHJlbGF0aXZlIGxpbmsgbmFtZXMgYSBwYXRoICp3aXRoaW4qIHRoZQogKiB0cmVlLCBzbyBhIHJlbmFtZSB0aGF0IHByZXNlcnZlcyB0aGUgdHJlZSdzIHNoYXBlIGtlZXBzIGV2ZXJ5IGxpbmsgdmFsaWQuCiAqCiAqIEEgZGlyZWN0b3J5IHRoYXQgYWxyZWFkeSBob2xkcyBhIHdob2xlIGFydGlmYWN0IGlzIHdoYXQgdGhpcyBleGlzdHMgdG8gYXJyaXZlIGF0LCBzbyBpdCByZXR1cm5zIHdpdGhvdXQKICogdG91Y2hpbmcgaXQ6IHRoZSBpZGVudGl0eSAqaXMqIHRoZSBjb250ZW50IChELTQ2OSkuCiAqLwpleHBvcnQgY29uc3QgZmlsbEZyb21FbnZpcm9ubWVudCA9IGFzeW5jICgpOiBQcm9taXNlPHZvaWQ+ID0+IHsKICAgIGNvbnN0IGVudiA9IHByb2Nlc3MuZW52OwogICAgY29uc3Qgcm9vdCA9IGVudltGSUxMX0VOVi5yb290XTsKICAgIGNvbnN0IGlkZW50aXR5ID0gZW52W0ZJTExfRU5WLmlkZW50aXR5XTsKICAgIGNvbnN0IGtlZXAgPSBlbnZbRklMTF9FTlYua2VlcF07CiAgICAvLyBSZWZ1c2VkIHJhdGhlciB0aGFuIGRlZmF1bHRlZDogYSBKb2IgdGhhdCBmb3Jnb3Qgb25lIG9mIHRoZXNlIHdvdWxkIHVucGFjayBhbiBhcnRpZmFjdCBpbnRvIHRoZQogICAgLy8gd3JvbmcgcGxhY2UsIG9yIGtlZXAgZXZlcnkgZGlyZWN0b3J5IG9uIHRoZSBub2RlIGZvciBldmVyLiBUaGUgc2hlbGwgc2FpZCB0aGUgc2FtZSB3aXRoIGA6ICIke3g6P30iYC4KICAgIGlmICghcm9vdCB8fCAhaWRlbnRpdHkgfHwgIWtlZXApIHsKICAgICAgICB0aHJvdyBuZXcgRXJyb3IoCiAgICAgICAgICAgIGAke0ZJTExfRU5WLnJvb3R9LCAke0ZJTExfRU5WLmlkZW50aXR5fSBhbmQgJHtGSUxMX0VOVi5rZWVwfSBhcmUgYWxsIHJlcXVpcmVkYCwKICAgICAgICApOwogICAgfQogICAgY29uc3QgdGFyZ2V0ID0gam9pbihyb290LCBpZGVudGl0eSk7CiAgICBpZiAoZXhpc3RzU3luYyhqb2luKHRhcmdldCwgQVJUSUZBQ1RfUkVBRFkpKSkgcmV0dXJuOwogICAgY29uc3Qgc3RhZ2luZyA9IGpvaW4ocm9vdCwgYC5zdGFnaW5nLSR7aWRlbnRpdHl9YCk7CiAgICBybVN5bmMoc3RhZ2luZywge3JlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWV9KTsKICAgIG1rZGlyU3luYyhzdGFnaW5nLCB7cmVjdXJzaXZlOiB0cnVlfSk7CiAgICAvLyBUaGUgcmV0ZW50aW9uIGlzIGhvdyBtYW55IGlkZW50aXRpZXMgc3RheSBvbiB0aGUgbm9kZSwgYW5kIHRoaXMgcnVuJ3MgZGlyZWN0b3J5IGlzIG9uZSBvZiB0aGVtOiB0aGUKICAgIC8vIHNoZWxsIHNwZWxsaW5nIHBhc3NlZCBvbmUgbW9yZSB0byBhIGhlbHBlciB0aGF0IGtlcHQgb25lIGZld2VyLCB3aGljaCBpcyB0aGUgc2FtZSBudW1iZXIgd3JpdHRlbgogICAgLy8gdHdpY2UgKEQtNDcwKS4KICAgIGF3YWl0IGZpbGxBcnRpZmFjdCh7CiAgICAgICAgc291cmNlOiBlbnZbRklMTF9FTlYucGF0aF0gPyB7cGF0aDogZW52W0ZJTExfRU5WLnBhdGhdfSA6IHt1cmw6IGVudltGSUxMX0VOVi51cmxdID8/ICcnfSwKICAgICAgICB0YXJnZXQ6IHN0YWdpbmcsCiAgICAgICAga2VlcDogTnVtYmVyKGtlZXApLAogICAgfSk7CiAgICAvLyBPbmx5IGV2ZXIgYW4gKmluY29tcGxldGUqIGRpcmVjdG9yeTogYSB3aG9sZSBvbmUgcmV0dXJuZWQgYWJvdmUsIHNvIHRoaXMgaXMgd2hhdCBhbiBpbnRlcnJ1cHRlZCBtb3ZlCiAgICAvLyBvciBhIHRyZWUgZnJvbSBhbiBlYXJsaWVyIHJldmlzaW9uIGxlYXZlcyBiZWhpbmQuCiAgICBybVN5bmModGFyZ2V0LCB7cmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZX0pOwogICAgcmVuYW1lU3luYyhzdGFnaW5nLCB0YXJnZXQpOwogICAgZHJvcFN0YWxlU3RhZ2luZyhyb290KTsKfTsKCi8qKgogKiBUaGUgcHJvZ3JhbSBoYWxmOiBhIGZpbGwgSm9iIHN0YXJ0cyB0aGlzIGZpbGUgd2l0aCBgbm9kZWAsIGFuZCBub3RoaW5nIGVsc2UgZG9lcy4KICoKICogTWF0Y2hlZCBieSAqcmVhbHBhdGgqIHJhdGhlciB0aGFuIGJ5IGNvbXBhcmluZyBVUkxzLCBiZWNhdXNlIHRoZSBjb3B5IGEgSm9iIHJ1bnMgaXMgbW91bnRlZCBmcm9tIGEKICogQ29uZmlnTWFwIGFuZCB0aGUga3ViZWxldCBwdWJsaXNoZXMgYSBtb3VudCBhcyBhIHN5bWxpbmsgdG8gYSB2ZXJzaW9uZWQgZGlyZWN0b3J5OiBgbm9kZSAvc2NyaXB0L2ZpbGwubXRzYAogKiByZXNvbHZlcyB0byBgLi4uLy4uMjAyNl8xMF8xMV8xNF80Nl81NS4xMjMvIGZpbGwubXRzYCwgc28gYGltcG9ydC5tZXRhLnVybGAgbmFtZXMgdGhhdCB3aGlsZQogKiBgcHJvY2Vzcy5hcmd2WzFdYCBuYW1lcyB0aGUgcGF0aCB0aGUgSm9iIHR5cGVkLiBDb21wYXJpbmcgdGhlIHR3byB2ZXJiYXRpbSB0aGVyZWZvcmUgbmV2ZXIgbWF0Y2hlZCwgYW5kCiAqIHRoZSBtb2R1bGUgZGlkIG5vdGhpbmcgYXQgYWxsIOKAlCB0aGUgZmlsbCBKb2IgcmVwb3J0ZWQgYENvbXBsZXRlZGAgc2Vjb25kcyBhZnRlciBpdCBzdGFydGVkIGFuZCBwdWJsaXNoZWQKICogbm90aGluZywgbGVhdmluZyBldmVyeSByZWFkZXIgUGVuZGluZyBvbiBhIGRpcmVjdG9yeSB0aGF0IHdhcyBuZXZlciBjcmVhdGVkIChmb3VuZCBpbiB0aGUgZGV2IGNsdXN0ZXIpLgogKiBUaGUgcmVhbHBhdGggY29tcGFyaXNvbiBydW5zIHRoZSBmaWxsIGluIGJvdGggdGhlIG1vdW50ZWQgYW5kIHRoZSBwbGFpbiBjYXNlLCBhbmQgc3RpbGwgcmVmdXNlcyB3aGVuIHRoZQogKiBtb2R1bGUgaXMgKmltcG9ydGVkKjogdGhlIGVudHJ5IHBvaW50IGlzIHRoZW4gdGhlIG9wZXJhdG9yJ3Mgb3duLgogKi8KY29uc3Qgc3RhcnRlZEFzQVByb2dyYW0gPSAoKTogYm9vbGVhbiA9PiB7CiAgICBjb25zdCBlbnRyeSA9IHByb2Nlc3MuYXJndlsxXTsKICAgIGlmICghZW50cnkpIHJldHVybiBmYWxzZTsKICAgIHRyeSB7CiAgICAgICAgcmV0dXJuIHJlYWxwYXRoU3luYyhlbnRyeSkgPT09IGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKTsKICAgIH0gY2F0Y2ggewogICAgICAgIC8vIEEgcGF0aCB0aGF0IGNhbm5vdCBiZSByZXNvbHZlZCBpcyBub3QgdGhpcyBtb2R1bGU6IGEgY2FsbGVyIHRoYXQgc3RhcnRlZCBzb21ldGhpbmcgZWxzZS4KICAgICAgICByZXR1cm4gZmFsc2U7CiAgICB9Cn07CgppZiAoc3RhcnRlZEFzQVByb2dyYW0oKSkgewogICAgYXdhaXQgZmlsbEZyb21FbnZpcm9ubWVudCgpOwp9Cg==
    kind: ConfigMap
    metadata:
      labels:
        app.kubernetes.io/managed-by: blong-kustomize
        app.kubernetes.io/name: blong-suite
        app.kubernetes.io/part-of: blong-suite
        app.kubernetes.io/version: 1.0.0
        blong.feasible.one/spec-hash: 6671139aeeb48853
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
        blong.feasible.one/spec-hash: 40eb52309aa3bc3e
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
            blong.feasible.one/namespace-kustomize: "true"
            blong.feasible.one/namespace-login: "true"
        spec:
          containers:
            - args:
                - /opt/deploy/suite/index.ts
                - release
                - --kustomize.orchestrator
                - --kustomize.gateway
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
  "services/kustomization.yaml": String(
    apiVersion: kustomize.config.k8s.io/v1beta1
    kind: Kustomization
    resources:
      - kustomize.yaml
      - login.yaml
    
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
