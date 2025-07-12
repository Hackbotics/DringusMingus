import { describe, expect, test, beforeAll, afterAll } from 'bun:test';
import robotLayer, { ServerInfo } from '../lib/robot_layer';
import { Effect, pipe } from 'effect';
import * as net from 'net';
import { CommandParser, Endianness } from '../lib/parser';

// Helper function to connect to the TCP server
async function connectToServer(
  host: string = '127.0.0.1',
  port: number = 8080,
): Promise<net.Socket> {
  const client = net.createConnection({ port, host });

  await new Promise((resolve) => {
    client.on('connect', () => {
      resolve(true);
    });
  });

  return client;
}

async function addIdentityCommand(
  client: net.Socket,
  vers: 1 | 2,
  shouldEcho: boolean = false,
) {
  const command = CommandParser.encode('identity', {
    vers,
    shouldEcho,
  });
  client.write(command);
}

// Helper function to read echo commands from the server
async function readEchoCommand(
  client: net.Socket,
  endianness: Endianness = Endianness.Little,
): Promise<any> {
  // Use a buffer to accumulate data in case of partial/fragmented TCP packets
  let buffer = Buffer.alloc(0);

  return new Promise((resolve) => {
    client.on('data', (data) => {
      // Append new data to buffer
      buffer = Buffer.concat([buffer, data]);

      // Try to parse as many echo commands as possible
      // Echo command: 1 byte command + N bytes payload (unknown length, so we treat all as one echo)
      // We'll parse only if the first byte is 2 (echo)
      if (buffer.length > 0 && buffer[0] === 2) {
        // All bytes after the first are the echo payload
        // Use Uint8Array for compatibility with CommandParser
        const uint8 = new Uint8Array(buffer);
        try {
          const parsed = CommandParser.parse(uint8, endianness);
          if (parsed.type === 'echo') {
            resolve(parsed);
            // Remove listener to avoid memory leak
            client.removeAllListeners('data');
          }
        } catch (e) {
          // Not enough data or parse error, wait for more
        }
      }
    });
  });
}

// create a test that will test the server info context

describe('Server Connection', () => {
  let server: net.Server;

  beforeAll(() => {
    // starts the server once for all tests
    server = pipe(
      robotLayer(),
      Effect.provideService(
        ServerInfo,
        ServerInfo.of({
          port: 8080,
          host: '127.0.0.1',
          isEcho: true,
        }),
      ),
      Effect.runSync,
    );
  });

  afterAll(async () => {
    // do something to stop the server
    await new Promise((resolve) => {
      server.close(resolve);
    });
    console.log('server closed');
  });

  test('test to see if we can connect to the server', async () => {
    const client = await connectToServer();
    expect(true).toBe(true);
    client.end();
  }, 1000); // 1s timeout

  test('test to see if we can send an identity command to the server', async () => {
    const client = await connectToServer();
    await addIdentityCommand(client, 1, true);
    const data = await readEchoCommand(client);
    expect(data).toEqual({
      type: 'echo',
      data: {
        array: [3, 1, 1],
      },
    });
    client.end();
  });

  test('test to see if we can send a movement command to the server', async () => {
    const client = await connectToServer();
    await addIdentityCommand(client, 2);
    // Add a small delay to ensure identity command is processed first
    await new Promise((resolve) => setTimeout(resolve, 100));
    const command = CommandParser.encode('move', {
      xPosition: 1,
      yPosition: 2,
    });
    client.write(command);
    const data = await readEchoCommand(client);
    expect(data).toEqual({
      type: 'echo',
      data: {
        array: [1, 1, 0, 2, 0],
      },
    });
    client.end();
  }, 2000);

  test('test to see if we can run two connections at the same time and both receive correct echo responses', async () => {
    // Connect both clients using the helper function
    const [client1, client2] = await Promise.all([
      connectToServer(),
      connectToServer(),
    ]);
    await Promise.all([
      addIdentityCommand(client1, 1),
      addIdentityCommand(client2, 2),
    ]);
    console.log('clients connected');

    // Add a small delay to ensure identity commands are processed first
    await new Promise((resolve) => setTimeout(resolve, 100));

    const command1 = CommandParser.encode('move', {
      xPosition: 1,
      yPosition: 2,
    });
    const command2 = CommandParser.encode('move', {
      xPosition: 3,
      yPosition: 4,
    });
    console.log('commands written');

    client1.write(command1);
    client2.write(command2);

    // Wait for both clients to receive their echo responses and parse them
    const [data1, data2] = await Promise.all([
      readEchoCommand(client1),
      readEchoCommand(client2),
    ]);

    client1.end();
    client2.end();

    expect(data1).toEqual({
      type: 'echo',
      data: {
        array: [1, 1, 0, 2, 0],
      },
    });
    expect(data2).toEqual({
      type: 'echo',
      data: {
        array: [1, 3, 0, 4, 0],
      },
    });
    expect(data1).not.toEqual(data2);
  });

  test('should connect to the socket and receive position-update commands', async () => {
    // Connect to the server as a client and also a client
    const [robot, client] = await Promise.all([
      connectToServer(),
      connectToServer(),
    ]);

    // Send identity command to register as robot (vers: 1)
    await addIdentityCommand(robot, 1);
    // this will be the whiteboard/controller
    await addIdentityCommand(client, 2);

    // wait for the identity commands to be processed
    await new Promise((resolve) => setTimeout(resolve, 100));
    robot.write(
      CommandParser.encode('setConfig', {
        isEcho: false,
      }),
    );
    // We'll simulate a robot starting at (0,0) and easing to (100, 50) in 5 steps
    const start = { x: 0, y: 0 };
    const end = { x: 100, y: 50 };
    const steps = 5;
    const positions = [];
    for (let i = 1; i <= steps; i++) {
      const x = Math.round(start.x + ((end.x - start.x) * i) / steps);
      const y = Math.round(start.y + ((end.y - start.y) * i) / steps);
      positions.push({ x, y });
    }

    // Send position-update commands to the client (simulate server sending updates)
    for (const pos of positions) {
      const buf = CommandParser.encode('position-update', {
        xPosition: pos.x,
        yPosition: pos.y,
      });
      robot.write(buf);
      console.log(`sent position-update command: ${pos.x}, ${pos.y}`);
    }

    // send a rewuest command
    const getBuf = CommandParser.encode('request', {});
    robot.write(getBuf);
    // wait for the response
    const data = await new Promise((resolve) => {
      client.on('data', (data) => {
        const parsed = CommandParser.parse(data, Endianness.Little);
        console.log(parsed);
        resolve(parsed);
      });
    });
    robot.end();
    client.end();
    expect(data).toEqual({
      type: 'get',
      data: {
        xPosition: 100,
        yPosition: 50,
      },
    });
  });
});

describe('Endianness Support', () => {
  test('should encode and decode move commands with little endian', () => {
    const moveData = { xPosition: 0x1234, yPosition: 0x5678 };

    // Encode with little endian
    const encoded = CommandParser.encode('move', moveData, Endianness.Little);

    // Should be: [1, 0x34, 0x12, 0x78, 0x56] (little endian)
    expect(Array.from(encoded)).toEqual([1, 0x34, 0x12, 0x78, 0x56]);

    // Decode with little endian
    const decoded = CommandParser.parse(encoded, Endianness.Little);
    expect(decoded).toEqual({
      type: 'move',
      data: moveData,
    });
  });

  test('should encode and decode move commands with big endian', () => {
    const moveData = { xPosition: 0x1234, yPosition: 0x5678 };

    // Encode with big endian
    const encoded = CommandParser.encode('move', moveData, Endianness.Big);

    // Should be: [1, 0x12, 0x34, 0x56, 0x78] (big endian)
    expect(Array.from(encoded)).toEqual([1, 0x12, 0x34, 0x56, 0x78]);

    // Decode with big endian
    const decoded = CommandParser.parse(encoded, Endianness.Big);
    expect(decoded).toEqual({
      type: 'move',
      data: moveData,
    });
  });

  test('should handle mixed endianness correctly', () => {
    const moveData = { xPosition: 0x1234, yPosition: 0x5678 };

    // Encode with little endian, try to decode with big endian (should give different result)
    const encodedLittle = CommandParser.encode(
      'move',
      moveData,
      Endianness.Little,
    );
    const decodedAsBig = CommandParser.parse(encodedLittle, Endianness.Big);

    // Values should be byte-swapped
    expect(decodedAsBig.data).toEqual({
      xPosition: 0x3412, // byte-swapped from 0x1234
      yPosition: 0x7856, // byte-swapped from 0x5678
    });
  });
});
