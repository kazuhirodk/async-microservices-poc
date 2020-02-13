const path  = require('path');
const { pool } = require('../config');
require('dotenv').config({path:  path.resolve(process.cwd(), '../.env')});

const amqp = require('amqplib');

// RabbitMQ connection string
const messageQueueConnectionString = process.env.CLOUDAMQP_URL;

async function listenForMessages() {
  // connect to Rabbit MQ
  let connection = await amqp.connect(messageQueueConnectionString);

  // create a channel and prefetch 1 message at a time
  let channel = await connection.createChannel();
  await channel.prefetch(1);

  // create a second channel to send back the results
  let resultsChannel = await connection.createConfirmChannel();

  // start consuming messages
  await consume({ connection, channel, resultsChannel });
}

// utility function to publish messages to a channel
function publishToChannel(channel, { routingKey, exchangeName, data }) {
  return new Promise((resolve, reject) => {
    channel.publish(exchangeName, routingKey, Buffer.from(JSON.stringify(data), 'utf-8'), { persistent: true }, function (err, ok) {
      if (err) {
        return reject(err);
      }

      resolve();
    })
  });
}

// consume messages from RabbitMQ
function consume({ connection, channel, resultsChannel }) {
  return new Promise((resolve, reject) => {
    channel.consume("processing.requests", async function (msg) {
      // parse message
      let msgBody = msg.content.toString();
      let data = JSON.parse(msgBody);
      let requestId = data.requestId;

      console.log("Received a request message, requestId:", requestId);

      // process data
      let processingResults = await processMessage(data);

      // publish results to channel
      await publishToChannel(resultsChannel, {
        exchangeName: "processing",
        routingKey: "result",
        data: { requestId, processingResults }
      });
      console.log("Published results for requestId:", requestId);

      // acknowledge message as processed successfully
      await channel.ack(msg);
    });

    // handle connection closed
    connection.on("close", (err) => {
      return reject(err);
    });

    // handle errors
    connection.on("error", (err) => {
      return reject(err);
    });
  });
}

function processMessage(data) {
  let { seatsBalanceId, operation } = data;

  return new Promise((resolve, reject) => {
    switch(operation) {
      case 'paid':
        resolve(paidSeat(seatsBalanceId));
        break;
      case 'refund':
        resolve(refundSeat(seatsBalanceId));
        break;
      case 'reserve':
        resolve(reserveSeat(seatsBalanceId));
        break;
      case 'return':
        resolve(returnReservedSeat(seatsBalanceId));
        break;
      default:
        resolve('Wrong operation');
    }
  });
}

// paid seat operation
function paidSeat(seatsBalanceId) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE seats_balance SET paid_seats = paid_seats + 1, reserved_seats = reserved_seats + 1, available_seats = available_seats - 1 WHERE id = $1', [seatsBalanceId], error => {
      if (error) {
        console.log(error);
      }

      resolve(`Seats balance of id ${seatsBalanceId} was successfully paid`);
    })
  })
}

// refund seat operation
function refundSeat(seatsBalanceId) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE seats_balance SET paid_seats = paid_seats - 1, reserved_seats = reserved_seats - 1, available_seats = available_seats + 1 WHERE id = $1', [seatsBalanceId], error => {
      if (error) {
        resolve(`Error for request of refund for Seats balance id: ${seatsBalanceId}`);
      }

      resolve(`Seats balance of id ${seatsBalanceId} was successfully refunded`);
    })
  })
}

// Reserve seat operation
function reserveSeat(seatsBalanceId) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE seats_balance SET reserved_seats = reserved_seats + 1, available_seats = available_seats - 1 WHERE id = $1', [seatsBalanceId], error => {
      if (error) {
        resolve(`Error for request of reserve for Seats balance id: ${seatsBalanceId}`);
      }

      resolve(`Seats balance of id ${seatsBalanceId} was successfully reserved`);
    })
  })
}

// Return reserved seat operation
function returnReservedSeat(seatsBalanceId) {
  return new Promise((resolve, reject) => {
    pool.query('UPDATE seats_balance SET reserved_seats = reserved_seats - 1, available_seats = available_seats + 1 WHERE id = $1', [seatsBalanceId], error => {
      if (error) {
        resolve(`Error for request of return a reserved seat for Seats balance id: ${seatsBalanceId}`);
      }

      resolve(`Seats balance of id ${seatsBalanceId} was successfully returned a seat`);
    })
  })
}

listenForMessages();
