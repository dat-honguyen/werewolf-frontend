import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface VersionResponse {
    version: string;
}

@Injectable({ providedIn: 'root' })
export class VersionApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = environment.apiBaseUrl;

    private readonly versionSignal = signal<string | null>(null);
    private versionRequest: Promise<string> | null = null;

    async getVersion(): Promise<string> {
        const cached = this.versionSignal();
        if (cached) {
            return cached;
        }
        this.versionRequest ??= firstValueFrom(
            this.http.get<VersionResponse>(`${this.baseUrl}/api/v1/version`)
        ).then((response) => response.version);
        const version = await this.versionRequest;
        this.versionSignal.set(version);
        return version;
    }
}
