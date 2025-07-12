import { Context, Data, Effect, pipe } from 'effect';
import { BunRuntime } from '@effect/platform-bun';
import * as net from 'net';
import { CommandParser, BufferedCommandParser, Endianness } from './parser';

export class ServerInfo extends Context.Tag('ServerInfo')<
  ServerInfo,
  {
    port: number;
    host: string;
    isEcho?: boolean;
    endianness?: Endianness;
  }
>() {}

const program = Effect.fn('program')(function* () {
  const serverInfo = yield* ServerInfo;
  console.log('Hello there! The server is up.');

  let robotPosition: { x: number; y: number } = { x: 0, y: 0 };
  let clients: { socket: net.Socket; id: string; identity: 1 | 2 }[] = [];
  const server = net.createServer((socket) =>
    pipe(
      Effect.gen(function* () {
        const randomIdentifier = Math.random().toString(36).substring(2, 15);
        console.log(`[${randomIdentifier}] New connection`);
        let whoAmI: 1 | 2 | undefined = undefined;
        const commandParser = new BufferedCommandParser(
          serverInfo.endianness ?? Endianness.Little,
        );

        socket.on('data', (data) => {
          // Convert data to Uint8Array and add to buffer
          const intArray = Uint8Array.from(data);
          console.log(
            `[${randomIdentifier}] Received ${intArray.length} bytes, buffer size: ${commandParser.getBufferSize()}`,
          );

          // Parse all complete commands from the buffer
          const parsedCommands = commandParser.addData(intArray);

          // Process each parsed command
          for (const command of parsedCommands) {
            console.log(`[${randomIdentifier}] Parsed command:`, command.type);

            if (command.type === 'identity') {
              const identityData = command.data as {
                vers: 1 | 2;
                shouldEcho: boolean;
              };
              whoAmI = identityData.vers;
              console.log(
                `[${randomIdentifier}] Verified who I am: ${whoAmI === 1 ? 'robot' : 'whiteboard/controller'}`,
              );
              clients.push({
                socket,
                id: randomIdentifier,
                identity: identityData.vers,
              });
              if (identityData.shouldEcho) {
                // Echo back the original command
                const echoData = CommandParser.encode(
                  'echo',
                  {
                    array: Array.from(intArray),
                  },
                  serverInfo.endianness ?? Endianness.Little,
                );
                socket.write(echoData);
              }
            } else if (serverInfo.isEcho && command.type !== 'setConfig') {
              // Echo back the original command
              const echoData = CommandParser.encode(
                'echo',
                {
                  array: Array.from(intArray),
                },
                serverInfo.endianness ?? Endianness.Little,
              );
              socket.write(echoData);
            } else {
              // Handle other command types
              switch (command.type) {
                case 'move':
                  const moveData = command.data as {
                    xPosition: number;
                    yPosition: number;
                  };
                  console.log(
                    `[${randomIdentifier}] Move command: x=${moveData.xPosition}, y=${moveData.yPosition}`,
                  );
                  // TODO: Implement move logic
                  break;
                case 'setConfig':
                  const configData = command.data as { isEcho?: boolean };
                  console.log(
                    `[${randomIdentifier}] SetConfig command: isEcho=${configData.isEcho}`,
                  );
                  serverInfo.isEcho = configData.isEcho ?? false;
                  break;
                case 'position-update':
                  const positionUpdateData = command.data as {
                    xPosition: number;
                    yPosition: number;
                  };
                  console.log(
                    `[${randomIdentifier}] PositionUpdate command: x=${positionUpdateData.xPosition}, y=${positionUpdateData.yPosition}`,
                  );
                  robotPosition = {
                    x: positionUpdateData.xPosition,
                    y: positionUpdateData.yPosition,
                  };
                  console.log(
                    `[${randomIdentifier}] Robot position updated: x=${robotPosition.x}, y=${robotPosition.y}`,
                  );
                  break;
                case 'get':
                  const getData = command.data as {
                    xPosition: number;
                    yPosition: number;
                  };
                  console.log(
                    `[${randomIdentifier}] Get command: x=${getData.xPosition}, y=${getData.yPosition}`,
                  );
                  // TODO: Implement get logic
                  break;
                case 'request':
                  console.log(`[${randomIdentifier}] Request command`);
                  console.log(
                    `[${randomIdentifier}] Clients Amount:`,
                    clients.length,
                  );
                  for (const client of clients) {
                    if (client.identity === 2) {
                      client.socket.write(
                        CommandParser.encode(
                          'get',
                          {
                            xPosition: robotPosition.x,
                            yPosition: robotPosition.y,
                          },
                          serverInfo.endianness ?? Endianness.Little,
                        ),
                      );
                      console.log(
                        `[${randomIdentifier}] Sent get command to ${client.id}`,
                      );
                    }
                  }
                  break;
              }
            }
            console.log(
              `[${randomIdentifier}] Command processed: ${command.type} (Commands left: ${commandParser.getBufferSize()})`,
            );
          }

          // Log partial command preview for debugging
          const preview = commandParser.previewPartialCommand();
          if (preview.possibleCommand && preview.missingBytes) {
            console.log(
              `[${randomIdentifier}] Partial command detected: ${preview.possibleCommand}, missing ${preview.missingBytes} bytes (confidence: ${preview.confidence})`,
            );
          }
        });

        socket.on('close', () => {
          console.log(`[${randomIdentifier}] Connection closed`);
          commandParser.clearBuffer();
        });

        socket.on('error', (error) => {
          console.error(`[${randomIdentifier}] Socket error:`, error);
          commandParser.clearBuffer();
        });

        // wait for 2 seconds and if no identity command was received, close the connection
        yield* Effect.sleep(2000);
        if (whoAmI === undefined) {
          console.log(
            `[${randomIdentifier}] No identity command received, closing connection`,
          );
          socket.end();
        }
      }),
      Effect.runFork,
    ),
  );

  server.listen(serverInfo.port, serverInfo.host, () => {
    console.log(`Server is running on ${serverInfo.host}:${serverInfo.port}`);
  });

  server.on('error', (error) => {
    console.error('Server error:', error);
  });

  return yield* Effect.succeed(server);
});

export default program;
