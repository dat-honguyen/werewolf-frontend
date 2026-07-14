import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';
import { RoleInfo, RulesResponse } from '../models/role.model';

@Injectable({ providedIn: 'root' })
export class RulesApiService {
    private readonly http = inject(HttpClient);
    private readonly baseUrl = environment.apiBaseUrl;

    private readonly rolesSignal = signal<RoleInfo[] | null>(null);
    private readonly rulesSignal = signal<RulesResponse | null>(null);
    private rolesRequest: Promise<RoleInfo[]> | null = null;
    private rulesRequest: Promise<RulesResponse> | null = null;

    async getRoles(): Promise<RoleInfo[]> {
        const cached = this.rolesSignal();
        if (cached) {
            return cached;
        }
        this.rolesRequest ??= firstValueFrom(
            this.http.get<RoleInfo[]>(`${this.baseUrl}/api/v1/roles`)
        );
        const roles = await this.rolesRequest;
        this.rolesSignal.set(roles);
        return roles;
    }

    async getRules(): Promise<RulesResponse> {
        const cached = this.rulesSignal();
        if (cached) {
            return cached;
        }
        this.rulesRequest ??= firstValueFrom(
            this.http.get<RulesResponse>(`${this.baseUrl}/api/v1/rules`)
        );
        const rules = await this.rulesRequest;
        this.rulesSignal.set(rules);
        return rules;
    }
}
