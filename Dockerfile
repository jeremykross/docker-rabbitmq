FROM debian:wheezy

MAINTAINER ContainerShip Developers <developers@containership.io>

RUN apt-get update && apt-get install -y curl ca-certificates --no-install-recommends && rm -rf /var/lib/apt/lists/*

RUN apt-key adv --keyserver ha.pool.sks-keyservers.net --recv-keys 434975BD900CCBE4F7EE1B1ED208507CA14F4FCA
RUN echo 'deb http://packages.erlang-solutions.com/debian wheezy contrib' > /etc/apt/sources.list.d/erlang.list

ENV RABBITMQ_LOGS=-
ENV RABBITMQ_SASL_LOGS=-

RUN apt-key adv --keyserver ha.pool.sks-keyservers.net --recv-keys F78372A06FF50C80464FC1B4F7B8CEA6056E8E56
RUN echo 'deb http://www.rabbitmq.com/debian/ testing main' > /etc/apt/sources.list.d/rabbitmq.list

ENV RABBITMQ_VERSION 3.5.4-1

RUN apt-get update && apt-get install -y rabbitmq-server=$RABBITMQ_VERSION curl --no-install-recommends && rm -rf /var/lib/apt/lists/*

ENV PATH /usr/lib/rabbitmq/bin:$PATH

VOLUME /var/lib/rabbitmq

# install npm & node
RUN curl -sL https://deb.nodesource.com/setup | bash -
RUN apt-get install nodejs -y
RUN curl https://www.npmjs.com/install.sh | sh
RUN npm install -g n
RUN n 0.10.38

# create /app and add files
WORKDIR /app
ADD . /app

# install dependencies
RUN npm install

# expose ports
EXPOSE 5672

# Execute the run script
CMD node rabbitmq.js
