import { randomUUID } from "node:crypto";
import { loadWorldConfigs } from "@realm/config";
import type { Capability, Message, RealmEvent, Room, RoomType } from "@realm/core";
import { makeId, nowIso } from "@realm/core";
import type { EventStore } from "@realm/storage";
import { OWNER_ID } from "./support.ts";

export type SendMessageInput = {
  worldId: string;
  roomId: string;
  operatorId?: string;
  displayedAuthorId?: string;
  content: string;
  idempotencyKey?: string;
};

export type CreateRoomInput = {
  worldId: string;
  type: RoomType;
  name: string;
  memberIds: string[];
  idempotencyKey?: string;
};

export type MessageServiceOptions = {
  root: string;
  eventStore: EventStore;
  clock: () => Date;
  assertAllowed: (capability: Capability) => void;
  appendAudit: (input: { actorId: string; action: string; target: string; reason: string }) => void;
};

export class MessageService {
  constructor(private readonly options: MessageServiceOptions) {}

  async listRooms(worldId: string): Promise<Room[]> {
    const world = (await loadWorldConfigs(this.options.root)).find(
      (candidate) => candidate.id === worldId,
    );
    const runtimeRooms = this.options.eventStore
      .list()
      .filter(
        (event): event is Extract<RealmEvent, { type: "room.created" }> =>
          event.type === "room.created" && event.room.worldId === worldId,
      )
      .map((event) => event.room);

    if (!world) {
      return runtimeRooms;
    }

    const memberIds = world.roles.map((role) => role.id);
    const configRooms = Object.entries(world.rooms).map(([id, room]) => ({
      id,
      worldId,
      type: room.type,
      name: room.name,
      memberIds,
    }));

    return [...configRooms, ...runtimeRooms];
  }

  createRoom(input: CreateRoomInput): Room {
    this.options.assertAllowed("room.create");
    const createdAt = nowIso(this.options.clock());
    const room: Room = {
      id: makeId("room", randomUUID()),
      worldId: input.worldId,
      type: input.type,
      name: input.name,
      memberIds: input.memberIds,
    };
    const eventId = makeId("event:room", randomUUID());
    const event = this.options.eventStore.append({
      eventId,
      schemaVersion: 1,
      aggregateId: makeId("world", input.worldId),
      idempotencyKey: input.idempotencyKey,
      createdAt,
      type: "room.created",
      room,
    });

    if (event.type !== "room.created") {
      throw new Error("Idempotency key collision returned a non-room event");
    }

    if (event.eventId === eventId) {
      this.options.appendAudit({
        actorId: OWNER_ID,
        action: "room.created",
        target: event.room.id,
        reason: `${event.room.type} room created`,
      });
    }
    return event.room;
  }

  listMessages(roomId: string): readonly Message[] {
    return this.options.eventStore
      .list()
      .filter(
        (event): event is Extract<RealmEvent, { type: "message.created" }> =>
          event.type === "message.created",
      )
      .map((event) => event.message)
      .filter((message) => message.roomId === roomId);
  }

  sendMessage(input: SendMessageInput): Message {
    const operatorId = input.operatorId ?? OWNER_ID;
    const displayedAuthorId = input.displayedAuthorId ?? operatorId;
    this.options.assertAllowed("message.send");
    if (displayedAuthorId !== operatorId) {
      this.options.assertAllowed("role.impersonate");
    }

    const createdDate = this.options.clock();
    const createdAt = nowIso(createdDate);
    const messageId = makeId("msg", randomUUID());
    const eventId = makeId("event:message", randomUUID());
    const message: Message = {
      id: messageId,
      worldId: input.worldId,
      roomId: input.roomId,
      authorId: displayedAuthorId,
      displayedAuthorId,
      realOperatorId: displayedAuthorId === operatorId ? undefined : operatorId,
      content: input.content,
      createdAt,
      reversibleUntil: nowIso(new Date(createdDate.getTime() + 30_000)),
    };

    const event = this.options.eventStore.append({
      eventId,
      schemaVersion: 1,
      aggregateId: makeId("room", input.roomId),
      idempotencyKey: input.idempotencyKey,
      createdAt,
      type: "message.created",
      message,
    });

    if (event.type !== "message.created") {
      throw new Error("Idempotency key collision returned a non-message event");
    }

    if (event.eventId === eventId && message.realOperatorId) {
      this.options.appendAudit({
        actorId: operatorId,
        action: "role.impersonate",
        target: message.id,
        reason: `Displayed author: ${displayedAuthorId}`,
      });
    }

    return event.message;
  }
}
