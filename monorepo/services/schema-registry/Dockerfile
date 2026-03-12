FROM tdp-python-base AS base

# Install service-specific dependencies
COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt && \
    rm /tmp/requirements.txt

# Copy application source and supporting files
COPY src/ /app/src/
COPY logging_config.py /app/logging_config.py
COPY entrypoint.sh /app/entrypoint.sh
COPY gunicorn_conf.py /app/gunicorn_conf.py

EXPOSE 8000

CMD ["/app/entrypoint.sh"]
