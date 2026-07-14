import { Injectable } from '@angular/core';
import * as signalR from '@microsoft/signalr';
import { Observable, Subject } from 'rxjs';
import { environment } from '../../../environments/environment';
import { WerewolfNotification } from '../models/notification.model';

/**
 * Wolverine.SignalR's WolverineHub exposes exactly one operation, "ReceiveMessage", in both
 * directions — there are no per-message hub methods like "JoinGameRoom". Every message is a
 * JSON string shaped like a CloudEvents envelope, with `type` naming the .NET message type
 * (its plain class name, e.g. "JoinGameRoom" or "PlayerNotification") and `data` holding the
 * camelCased payload. See Wolverine.SignalR's WolverineHub/SignalRTransport/CloudEventsMapper.
 */
const RECEIVE_MESSAGE_OPERATION = 'ReceiveMessage';

interface CloudEventsEnvelope {
    type: string;
    data: unknown;
    id?: string;
    time?: string;
}

interface PlayerNotificationPayload {
    kind: string;
    payload?: Record<string, unknown> | null;
}

@Injectable({ providedIn: 'root' })
export class WerewolfHubService {
    private connection: signalR.HubConnection | null = null;
    private readonly notificationsSubject = new Subject<WerewolfNotification>();
    private readonly reconnectedSubject = new Subject<void>();

    readonly notifications$: Observable<WerewolfNotification> =
        this.notificationsSubject.asObservable();

    /** Fires when the connection recovers after a drop, so callers can resync state
     * without needing a polling loop — this is the only non-notification-driven refresh. */
    readonly reconnected$: Observable<void> = this.reconnectedSubject.asObservable();

    async connect(): Promise<void> {
        if (this.connection) {
            return;
        }
        this.connection = new signalR.HubConnectionBuilder()
            .withUrl(environment.hubUrl)
            .withAutomaticReconnect()
            .build();

        this.connection.on(RECEIVE_MESSAGE_OPERATION, (json: string) => {
            const envelope = JSON.parse(json) as CloudEventsEnvelope;
            if (envelope.type !== 'PlayerNotification') {
                return;
            }
            const { kind, payload } = envelope.data as PlayerNotificationPayload;
            this.notificationsSubject.next({ kind, ...(payload ?? {}) } as WerewolfNotification);
        });
        this.connection.onreconnected(() => this.reconnectedSubject.next());

        await this.connection.start();
    }

    async joinRoom(roomCode: string, playerId: string): Promise<void> {
        await this.sendCommand('JoinGameRoom', { roomCode, playerId });
    }

    async leaveRoom(roomCode: string, playerId: string): Promise<void> {
        await this.sendCommand('LeaveGameRoom', { roomCode, playerId });
    }

    async disconnect(): Promise<void> {
        await this.connection?.stop();
        this.connection = null;
    }

    private async sendCommand(type: string, data: unknown): Promise<void> {
        const envelope: CloudEventsEnvelope = {
            type,
            data,
            id: crypto.randomUUID(),
            time: new Date().toISOString()
        };
        await this.connection?.invoke(RECEIVE_MESSAGE_OPERATION, JSON.stringify(envelope));
    }
}
