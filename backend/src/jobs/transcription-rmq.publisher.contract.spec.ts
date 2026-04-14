import * as amqp from 'amqplib';
import { TRANSCRIPTION_REQUESTS_QUEUE } from './jobs.constants';
import { TranscriptionRmqPublisher } from './transcription-rmq.publisher';

jest.mock('amqplib', () => ({
  connect: jest.fn(),
}));

describe('TranscriptionRmqPublisher message contract', () => {
  const sendToQueue = jest.fn();
  const assertQueue = jest.fn();
  const closeChannel = jest.fn();
  const createConfirmChannel = jest.fn();
  const closeConnection = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    sendToQueue.mockImplementation((_queue, _body, _opts, cb) => cb?.(null));
    assertQueue.mockResolvedValue(undefined);
    closeChannel.mockResolvedValue(undefined);
    createConfirmChannel.mockResolvedValue({
      assertQueue,
      sendToQueue,
      close: closeChannel,
    });
    closeConnection.mockResolvedValue(undefined);
    (amqp.connect as jest.Mock).mockResolvedValue({
      createConfirmChannel,
      close: closeConnection,
    });
  });

  it('publishes message with required queue contract fields', async () => {
    const publisher = new TranscriptionRmqPublisher();

    await publisher.publishJobQueued({
      jobId: 'b11b4c69-fde7-4fa3-b9a5-4577a1a9e89f',
      title: 'recording.mp3',
      userId: 'user-42',
    });

    expect(assertQueue).toHaveBeenCalledWith(TRANSCRIPTION_REQUESTS_QUEUE, {
      durable: true,
    });
    expect(sendToQueue).toHaveBeenCalledTimes(1);
    expect(sendToQueue.mock.calls[0][0]).toBe(TRANSCRIPTION_REQUESTS_QUEUE);
    expect(sendToQueue.mock.calls[0][2]).toEqual({ persistent: true });

    const body = sendToQueue.mock.calls[0][1] as Buffer;
    const parsed = JSON.parse(body.toString('utf-8')) as {
      pattern: string;
      data: { jobId: string; title: string; userId: string };
    };
    expect(parsed).toEqual({
      pattern: TRANSCRIPTION_REQUESTS_QUEUE,
      data: {
        jobId: 'b11b4c69-fde7-4fa3-b9a5-4577a1a9e89f',
        title: 'recording.mp3',
        userId: 'user-42',
      },
    });

    await publisher.onModuleDestroy();
    expect(closeChannel).toHaveBeenCalled();
    expect(closeConnection).toHaveBeenCalled();
  });
});
