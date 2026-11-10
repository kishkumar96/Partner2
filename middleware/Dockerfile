# Pull base image
FROM python:3.12-slim-bookworm

RUN apt-get update \
	&& apt-get install -y --no-install-recommends \
		postgresql-client \
		build-essential \
		gdal-bin \
		libgdal-dev \
		libgeos-dev \
		libproj-dev \
	&& rm -rf /var/lib/apt/lists/*
# Set environment variables
ENV PIP_DISABLE_PIP_VERSION_CHECK 1
ENV PYTHONDONTWRITEBYTECODE 1
ENV PYTHONUNBUFFERED 1

# Set work directory
WORKDIR /code

# Install dependencies
COPY ./requirements.txt .
RUN pip install --upgrade pip \
	&& pip install -r requirements.txt


# Copy project
COPY . .

# No entrypoint: docker-compose controls the command.

#SSSSENTRYPOINT ["sh", "/entrypoint.sh"]

#COPY ./entrypoint.sh .
#RUN sed -i 's/\r$//g' /code/entrypoint.sh
#RUN chmod +x /code/entrypoint.sh



##ENTRYPOINT ["/code/entrypoint.sh"]