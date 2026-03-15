# Contributing

## Local Development

### Connecting to the Local Database

The local k3d cluster runs a PostgreSQL instance managed by CloudNativePG. Tilt exposes it on `localhost:5432` via the `cnpg-port-forward` resource.

Connect with [pgcli](https://github.com/dbcli/pgcli):

```bash
PGPASSWORD=local-dev-password PGSSLMODE=disable pgcli -h localhost -p 5432 -U tdp -d schema_registry
```

If the connection is refused, the port-forward may have died. Trigger a restart from Tilt:

```bash
tilt trigger cnpg-port-forward
```

Or restart it manually:

```bash
kubectl port-forward svc/tdp-postgres-rw -n tdp 5432:5432
```
