import { Component, computed, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { inject } from '@angular/core';
import { AVATAR_PALETTE, AVATAR_SIGILS } from '../../../core/utils/role-icon.util';
import { pick } from '../../../core/utils/hash.util';

/** A deterministic "random" avatar: the same seed (display name) always renders the same
 * jewel-toned sigil, so players get a stable identity without any uploaded/fetched image. */
@Component({
    selector: 'app-avatar',
    imports: [],
    templateUrl: './avatar.html',
    styleUrl: './avatar.scss'
})
export class Avatar {
    private readonly sanitizer = inject(DomSanitizer);

    readonly seed = input.required<string>();
    readonly size = input(44);

    readonly color = computed(() => pick(AVATAR_PALETTE, this.seed(), 'color'));
    readonly sigil = computed(() => {
        // AVATAR_SIGILS is a fixed, hardcoded lookup table of SVG markup (role-icon.util.ts),
        // never user input.
        // eslint-disable-next-line no-restricted-syntax
        return this.sanitizer.bypassSecurityTrustHtml(pick(AVATAR_SIGILS, this.seed(), 'sigil'));
    });
}
