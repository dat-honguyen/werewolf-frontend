import { Component, inject, output, signal } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { TranslatePipe } from '@ngx-translate/core';
import { RulesApiService } from '../../../core/services/rules-api.service';
import { RoleInfo } from '../../../core/models/role.model';
import { ROLE_ICON } from '../../../core/utils/role-icon.util';
import { roleAccent } from '../../../core/utils/role-accent.util';

/**
 * The full, backend-authored rules-accurate description for every role (GetRolesEndpoint) --
 * split out from the identity grimoire card, which now shows only a short FE-local blurb
 * (public/i18n/*.json's roleDescriptions) instead of fetching this on every role change. This
 * modal is the one place a player goes to read the complete rules for a role, on demand.
 */
@Component({
    selector: 'app-role-guide-modal',
    imports: [TranslatePipe],
    templateUrl: './role-guide-modal.html',
    styleUrl: './role-guide-modal.scss'
})
export class RoleGuideModal {
    private readonly rulesApi = inject(RulesApiService);
    private readonly sanitizer = inject(DomSanitizer);

    readonly closed = output<void>();

    readonly roles = signal<RoleInfo[] | null>(null);
    readonly loadFailed = signal(false);

    constructor() {
        this.rulesApi
            .getRoles()
            .then((roles) => this.roles.set(roles))
            .catch(() => this.loadFailed.set(true));
    }

    accent(role: RoleInfo['role']): string | null {
        return roleAccent(role);
    }

    icon(role: RoleInfo['role']) {
        return this.sanitizer.bypassSecurityTrustHtml(ROLE_ICON[role]);
    }
}
