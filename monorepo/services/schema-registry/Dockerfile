# Schema Registry Dockerfile
# Extends the platform base image — do not duplicate the multi-stage build here.
# Build the base first:
#   docker build -f monorepo/services/Dockerfile.base -t tdp-python-base monorepo/services/

FROM tdp-python-base

WORKDIR /app

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY src/ ./src/
COPY logging_config.py .
COPY gunicorn_conf.py .
COPY entrypoint.sh .
RUN chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
