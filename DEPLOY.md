# Deploy — Gudy Money no Portainer

## Visão geral

```
Servidor
├── postgres-app  (já existe)
├── gudy_api      (novo)
├── gudy_web      (novo)
└── gudy_nginx    (novo — porta 3002 → 80)
```

---

## 1. Preparar o banco de dados

Acesse o container `postgres-app` e crie o banco e usuário:

```bash
docker exec -it postgres-app psql -U postgres
```

```sql
CREATE USER gudy WITH PASSWORD 'troque_por_senha_forte';
CREATE DATABASE gudy_money OWNER gudy;
GRANT ALL PRIVILEGES ON DATABASE gudy_money TO gudy;
\q
```

---

## 2. Descobrir a rede do postgres-app

```bash
docker inspect postgres-app | grep -i network
# ou
docker network ls
```

Anote o nome da rede (ex: `server_default`, `bridge`, etc.).

---

## 3. Buildar as imagens na sua máquina

Na raiz do repositório:

```bash
# API
docker build -f apps/api/Dockerfile -t gudy-api:latest .

# Web — substitua SEU_IP_OU_DOMINIO pelo IP ou domínio do servidor
docker build -f apps/web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=http://SEU_IP_OU_DOMINIO:3002/api \
  -t gudy-web:latest .
```

---

## 4. Enviar as imagens para o servidor

### Opção A — salvar/carregar via arquivo (sem registry)

```bash
# Na sua máquina
docker save gudy-api:latest | gzip > gudy-api.tar.gz
docker save gudy-web:latest | gzip > gudy-web.tar.gz

# Copiar para o servidor
scp gudy-api.tar.gz gudy-web.tar.gz usuario@SEU_IP:/tmp/

# No servidor
docker load < /tmp/gudy-api.tar.gz
docker load < /tmp/gudy-web.tar.gz
```

### Opção B — usar um registry privado (Docker Hub, GHCR, etc.)

```bash
docker tag gudy-api:latest seu-usuario/gudy-api:latest
docker push seu-usuario/gudy-api:latest

docker tag gudy-web:latest seu-usuario/gudy-web:latest
docker push seu-usuario/gudy-web:latest
```

Ajuste o campo `image:` no `docker-compose.portainer.yml` para o endereço do registry.

---

## 5. Copiar arquivos de configuração para o servidor

```bash
scp docker-compose.portainer.yml usuario@SEU_IP:~/gudy/
scp -r nginx/nginx.portainer.conf usuario@SEU_IP:~/gudy/nginx/
```

---

## 6. Criar a Stack no Portainer

1. Acesse o Portainer → **Stacks** → **Add stack**
2. Nome: `gudy-money`
3. Em **Build method**: selecione **Web editor**
4. Cole o conteúdo de `docker-compose.portainer.yml`
5. Em **Environment variables**, adicione:

| Variável | Valor |
|---|---|
| `POSTGRES_HOST` | `postgres-app` (ou nome do container) |
| `POSTGRES_PORT` | `5432` |
| `POSTGRES_DB` | `gudy_money` |
| `POSTGRES_USER` | `gudy` |
| `POSTGRES_PASSWORD` | sua senha |
| `SERVER_NETWORK` | nome da rede do postgres-app |
| `JWT_SECRET` | string aleatória longa |
| `JWT_REFRESH_SECRET` | string aleatória longa |
| `SUPERADMIN_JWT_SECRET` | string aleatória longa |
| `PUBLIC_API_URL` | `http://SEU_IP:3002/api` |
| `API_PORT` | `3001` (porta exposta da API) |
| `WEB_PORT` | `3000` (porta exposta do frontend) |

6. Clique em **Deploy the stack**

---

## 7. Verificar o deploy

```bash
# Logs da API (deve mostrar "running on port 3001" e migrations aplicadas)
docker logs gudy_api

# Logs do web
docker logs gudy_web

# Testar a API
curl http://SEU_IP:3002/api/health
```

---

## Gerar segredos JWT

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Execute 3 vezes para gerar `JWT_SECRET`, `JWT_REFRESH_SECRET` e `SUPERADMIN_JWT_SECRET`.

---

## Atualizar após novo deploy

```bash
# 1. Rebuildar as imagens (passo 3)
# 2. Reenviar para o servidor (passo 4)
# 3. No Portainer → Stacks → gudy-money → Update the stack
#    (o Portainer recria os containers com as novas imagens)
```

As migrations do Prisma são aplicadas automaticamente no startup da API.
