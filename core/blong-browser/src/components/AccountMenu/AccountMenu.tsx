import './AccountMenu.css';

import React, {useEffect, useMemo, useRef} from 'react';
import {Avatar, Menu} from '../../primereact/index.js';
import type {MenuItem} from '../../primereact/index.js';
import {useBlong} from '../../context/BlongContext.js';
import {useAppStore} from '../../state/appStore.js';
import {useText} from '../../hooks/useText.js';

/**
 * AccountMenu — the top-right account element in the portal menubar.
 *
 * Renders an avatar showing the current user's initials (derived from the
 * store profile — populated from the configured profile-get method — falling
 * back to a generic user icon). Clicking it opens a small menu with:
 *   - "Profile" — opens the configured profile page as a portal tab
 *   - "Sign out" — revokes the session and resets auth state
 *
 * The profile wiring is config-driven (see `IPortalConfig.profile`): `page`
 * is the component method that returns the profile page, `get` is the server
 * method returning the caller's own profile for the avatar. When neither is
 * configured the avatar still renders but only offers "Sign out".
 */
export interface IAccountMenuProps {
    /** Component method that opens the profile page (e.g. 'access.user.profile'). */
    profilePage?: string;
    /** Server method returning the caller's profile (e.g. 'access.profile.get'). */
    profileGet?: string;
}

function deriveInitials(name: string | undefined): string | undefined {
    if (!name) return undefined;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (parts[0]?.length >= 2) return parts[0].slice(0, 2).toUpperCase();
    return parts[0]?.[0]?.toUpperCase();
}

/** A raw profile-get result — shaped loosely so both access-profile and IUserProfile shapes work. */
interface IProfileData {
    actorId?: string;
    userId?: string;
    firstName?: string;
    lastName?: string;
    userName?: string;
    emailAddress?: string;
    initials?: string;
    language?: string;
    preferredLanguage?: string;
    /** access.profile.get nests the personal-name fields under `person`. */
    person?: {firstName?: string; lastName?: string};
}

/** The runtime handler proxy — any method key, called with (params, $meta). */
type HandlerCall = (params: object, meta: object) => Promise<unknown>;

export function AccountMenu({profilePage, profileGet}: IAccountMenuProps) {
    const {handler} = useBlong();
    const profile = useAppStore(s => s.auth.profile);
    const portalConfig = useAppStore(s => s.portal.portalConfig);
    const setProfile = useAppStore(s => s.setProfile);
    const openTab = useAppStore(s => s.openTab);
    const menuRef = useRef<Menu>(null);

    // Props win over the portal config (which is populated asynchronously).
    const page = profilePage ?? portalConfig?.profile?.page;
    const get = profileGet ?? portalConfig?.profile?.get;

    const profileLabel = useText('Profile');
    const signOutLabel = useText('Sign out');

    // Populate the store profile from the configured profile-get method so the
    // avatar shows the user's initials right after login (best-effort).
    useEffect(() => {
        if (!get) return;
        let cancelled = false;
        void (async () => {
            try {
                const data = (await (handler as Record<string, HandlerCall>)[get](
                    {},
                    {},
                )) as IProfileData;
                if (cancelled || !data) return;
                const firstName = data.person?.firstName ?? data.firstName;
                const lastName = data.person?.lastName ?? data.lastName;
                const name =
                    [firstName, lastName].filter(Boolean).join(' ') ||
                    data.userName ||
                    data.emailAddress ||
                    '';
                setProfile({
                    actorId: data.actorId ?? data.userId ?? '',
                    name: name || undefined,
                    initials: data.initials ?? undefined,
                    language: data.language ?? data.preferredLanguage ?? undefined,
                });
            } catch {
                // Profile fetch is best-effort — the avatar falls back to the
                // generic user icon.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [get, handler, setProfile]);

    const initials = useMemo(() => profile?.initials ?? deriveInitials(profile?.name), [profile]);

    const onLogout = React.useCallback(async () => {
        // Server-side revoke (closes the session + clears the restore cookie)
        // then resets the local auth state.
        await handler.authLogout({}, {});
    }, [handler]);

    const openProfile = React.useCallback(async () => {
        if (!page) return;
        try {
            const resolved = (await (handler as Record<string, HandlerCall>)[
                `component/${page}`
            ]({}, {})) as {
                title?: string;
                component: () => Promise<React.ComponentType>;
            };
            const component = await resolved.component();
            openTab({
                id: `page-${page}`,
                actionName: page,
                title: resolved.title ?? profileLabel,
                component,
            });
        } catch {
            // The tab stays closed; the dispatch may have surfaced the error.
        }
    }, [page, handler, openTab, profileLabel]);

    const model = useMemo<MenuItem[]>(() => {
        const items: MenuItem[] = [];
        if (page) {
            items.push({label: profileLabel, icon: 'pi pi-user', command: () => void openProfile()});
            items.push({separator: true});
        }
        items.push({label: signOutLabel, icon: 'pi pi-sign-out', command: () => void onLogout()});
        return items;
    }, [page, profileLabel, signOutLabel, openProfile, onLogout]);

    return (
        <div className="blong-account-menu">
            <Avatar
                label={initials}
                icon={initials ? undefined : 'pi pi-user'}
                shape="circle"
                className="blong-account-menu__avatar"
                onClick={e => menuRef.current?.toggle(e)}
                title={profile?.name}
            />
            <Menu model={model} popup ref={menuRef} className="blong-account-menu__menu" />
        </div>
    );
}
