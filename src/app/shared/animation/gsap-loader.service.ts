import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GsapLoaderService {
    private gsapModule: Promise<typeof import('gsap')> | null = null;

    async load(): Promise<typeof import('gsap') | null> {
        this.gsapModule ??= import('gsap').catch(() => null as never);
        try {
            return await this.gsapModule;
        } catch {
            return null;
        }
    }
}
