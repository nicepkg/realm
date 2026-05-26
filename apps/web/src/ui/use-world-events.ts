import type { Room, WorldSummary } from "@realm/api-contract";
import type { RealmHttpClient } from "@realm/client-sdk";
import { useState } from "react";
import { parsePatchValue } from "./realm-ui-helpers.ts";

type WorldEventOptions = {
  client: RealmHttpClient;
  selectedRoom?: Room;
  selectedWorld?: WorldSummary;
  reload: () => Promise<void>;
};

export function useWorldEvents({ client, selectedRoom, selectedWorld, reload }: WorldEventOptions) {
  const [worldEventTitle, setWorldEventTitle] = useState("Sudden Storm");
  const [worldEventDescription, setWorldEventDescription] = useState(
    "The world weather shifts and everyone must adapt.",
  );
  const [worldEventPath, setWorldEventPath] = useState("/publicState/weather");
  const [worldEventValue, setWorldEventValue] = useState('"storm"');
  const [worldEventConditionPath, setWorldEventConditionPath] = useState("/publicState/weather");
  const [worldEventResult, setWorldEventResult] = useState<string | undefined>();

  async function triggerManualWorldEvent() {
    if (!selectedWorld || !worldEventTitle.trim() || !worldEventPath.trim()) {
      return;
    }
    const response = await client.triggerManualWorldEvent(selectedWorld.id, {
      title: worldEventTitle.trim(),
      description: worldEventDescription.trim() || worldEventTitle.trim(),
      severity: "minor",
      roomId: selectedRoom?.id,
      operations: [
        { op: "set", path: worldEventPath.trim(), value: parsePatchValue(worldEventValue) },
      ],
      idempotencyKey: `web-world-event-${Date.now()}`,
    });
    setWorldEventResult(
      describeWorldEventResult(response.event.status, response.event.stateVersion),
    );
    await reload();
  }

  async function triggerRandomWorldEvent() {
    if (!selectedWorld) {
      return;
    }
    const eventKey = `web-random-${Date.now()}`;
    const response = await client.triggerRandomWorldEvent(selectedWorld.id, {
      seed: eventKey,
      roomId: selectedRoom?.id,
      idempotencyKey: eventKey,
    });
    setWorldEventResult(`${response.event.title}: ${response.event.status}`);
    await reload();
  }

  async function triggerWorldTick() {
    if (!selectedWorld) {
      return;
    }
    const response = await client.triggerWorldTick(selectedWorld.id, {
      roomId: selectedRoom?.id,
      idempotencyKey: `web-tick-${Date.now()}`,
    });
    setWorldEventResult(`Tick ${response.tick.tick}: ${response.event.title}`);
    await reload();
  }

  async function triggerConditionWorldEvent() {
    if (!selectedWorld || !worldEventConditionPath.trim() || !worldEventPath.trim()) {
      return;
    }
    const response = await client.triggerConditionWorldEvent(selectedWorld.id, {
      title: worldEventTitle.trim(),
      description: worldEventDescription.trim() || worldEventTitle.trim(),
      severity: "minor",
      condition: { path: worldEventConditionPath.trim(), exists: true },
      roomId: selectedRoom?.id,
      operations: [
        { op: "set", path: worldEventPath.trim(), value: parsePatchValue(worldEventValue) },
      ],
      idempotencyKey: `web-condition-${Date.now()}`,
    });
    setWorldEventResult(
      describeWorldEventResult(response.event.status, response.event.stateVersion),
    );
    await reload();
  }

  async function loadWorldEventReplay() {
    if (!selectedWorld) {
      return;
    }
    const replay = await client.getWorldEventReplay(selectedWorld.id);
    setWorldEventResult(
      `${replay.events.length} replay events · ${replay.replayHash.slice(0, 12)}`,
    );
  }

  return {
    loadWorldEventReplay,
    setWorldEventConditionPath,
    setWorldEventDescription,
    setWorldEventPath,
    setWorldEventTitle,
    setWorldEventValue,
    triggerConditionWorldEvent,
    triggerManualWorldEvent,
    triggerRandomWorldEvent,
    triggerWorldTick,
    worldEventConditionPath,
    worldEventDescription,
    worldEventPath,
    worldEventResult,
    worldEventTitle,
    worldEventValue,
  };
}

function describeWorldEventResult(status: string, version: number | undefined): string {
  return version === undefined ? status : `${status} state v${version}`;
}
