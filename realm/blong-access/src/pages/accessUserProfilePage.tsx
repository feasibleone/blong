import {
    AssetWidget,
    BlobImage,
    Button,
    Card,
    Dropdown,
    InputText,
    Message,
    Password,
    useAppStore,
    useBlong,
} from '@feasibleone/blong-browser';
import React, {useCallback, useEffect, useState} from 'react';
import './accessUserProfilePage.css';

/** The namespace a person's photograph is stored in: the person's own record carries it. */
const PARTY_NAMESPACE = 'party';

/** Available UI languages shown in the Preferences dropdown. */
const LANGUAGES = [
    {value: 'en', label: 'English'},
    {value: 'bg', label: 'Български'},
];

interface IProfilePerson {
    personId: string;
    firstName: string;
    middleName: string | null;
    lastName: string;
    /** The photograph: a `blob://` reference or an external URL (`@@D-842`). */
    photoUrl?: string | null;
}

interface IProfile {
    userId: string;
    userName: string | null;
    emailAddress: string | null;
    isActive: boolean;
    preferredLanguage: string | null;
    roles: Array<{roleId: string; roleName: string}>;
    person: IProfilePerson | null;
}

/**
 * AccessUserProfilePage — the self-service profile page.
 *
 * Shows account details, granted roles (read-only), and lets the user edit
 * their personal details (name/email), preferred language, and password.
 *
 * The personal details are editable whether or not the account has a person yet: the first save that
 * carries a first and a last name creates one (`access.profile.edit`, `@@D-874`). A suite without the
 * party realm keeps the fields, and the save stores nothing there — the server's documented fallback.
 */
export function AccessUserProfilePage() {
    const {handler} = useBlong();
    const translations = useAppStore(s => s.translations);
    // Plain translation lookup (not a hook) — safe to call inside callbacks.
    const tr = React.useCallback((text: string) => translations[text] ?? text, [translations]);
    const setProfile = useAppStore(s => s.setProfile);

    const [profile, setProfileState] = useState<IProfile | null>(null);
    const [loadError, setLoadError] = useState<string | undefined>(undefined);

    // Editable personal-details form state.
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [photoUrl, setPhotoUrl] = useState<string | null>(null);
    const [emailAddress, setEmailAddress] = useState('');
    const [preferredLanguage, setPreferredLanguage] = useState('en');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | undefined>(undefined);

    // Change-password form state.
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [changing, setChanging] = useState(false);
    const [pwError, setPwError] = useState<string | undefined>(undefined);
    const [pwDone, setPwDone] = useState(false);


    useEffect(() => {
        let cancelled = false;
        void (async () => {
            try {
                const data = (await handler.accessProfileGet({}, {})) as IProfile;
                if (cancelled) return;
                setProfileState(data);
                setFirstName(data.person?.firstName ?? '');
                setLastName(data.person?.lastName ?? '');
                setPhotoUrl(data.person?.photoUrl ?? null);
                setEmailAddress(data.emailAddress ?? '');
                setPreferredLanguage(data.preferredLanguage ?? 'en');
            } catch (error) {
                if (!cancelled) {
                    setLoadError((error as {message?: string}).message ?? 'Failed to load profile');
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [handler]);

    const onSave = useCallback(async () => {
        setSaving(true);
        setSaved(false);
        setSaveError(undefined);
        try {
            await handler.accessProfileEdit(
                {
                    // Sent whether or not the account has a person: a filled-in name is what creates
                    // one, and an emptied one is refused by the server with a message rather than a
                    // database error (`@@D-874`, T-694).
                    firstName: firstName || null,
                    lastName: lastName || null,
                    photoUrl,
                    emailAddress: emailAddress || null,
                    preferredLanguage,
                },
                {},
            );
            setSaved(true);
            // Keep the top-right avatar in sync.
            const name = [firstName, lastName].filter(Boolean).join(' ') || undefined;
            const initials = name
                ? name
                      .trim()
                      .split(/\s+/)
                      .filter(Boolean)
                      .map(p => p[0])
                      .join('')
                      .slice(0, 2)
                      .toUpperCase()
                : undefined;
            setProfile({
                actorId: profile?.userId ?? '',
                name,
                initials,
                language: preferredLanguage,
                // The menubar avatar draws this, so a replaced photograph shows up there without a
                // reload (`@@D-842`).
                photoUrl: photoUrl ?? undefined,
            });
        } catch (error) {
            setSaveError((error as {message?: string}).message ?? 'Failed to save profile');
        } finally {
            setSaving(false);
        }
    }, [
        handler,
        firstName,
        lastName,
        photoUrl,
        emailAddress,
        preferredLanguage,
        setProfile,
        profile?.userId,
    ]);

    const onChangePassword = useCallback(async () => {
        setPwError(undefined);
        setPwDone(false);
        if (newPassword !== confirmPassword) {
            setPwError(tr('Passwords do not match'));
            return;
        }
        setChanging(true);
        try {
            await handler.accessProfilePasswordChange({currentPassword, newPassword}, {});
            setPwDone(true);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            setPwError((error as {message?: string}).message ?? 'Password change failed');
        } finally {
            setChanging(false);
        }
    }, [handler, currentPassword, newPassword, confirmPassword, tr]);

    if (loadError) {
        return (
            <div className="access-profile">
                <Message
                    severity="error"
                    text={loadError}
                />
            </div>
        );
    }

    return (
        <div className="access-profile grid col align-self-start max-w-screen">
            {/* Left column — personal details + change password */}
            <div className="col-12 xl:col-6">
                <Card title={tr('Profile')}>
                    {profile && (
                        <p className="access-profile__account">
                            <strong>{profile.userName ?? profile.userId}</strong>
                            {profile.isActive ? (
                                <span className="access-profile__active">{tr('Active')}</span>
                            ) : (
                                <span className="access-profile__inactive">{tr('Inactive')}</span>
                            )}
                        </p>
                    )}

                    {/* The photograph, above the details: the picture as the store keeps it — a
                        derived thumbnail when there is one — and the widget that replaces it
                        (`@@D-842`). Without one the initials stand in, which is what the menubar
                        does too. Shown before a person exists like the names below, because the
                        save that carries the names is what creates it (`@@D-874`). */}
                    <div className="access-profile__avatar">
                        <BlobImage
                            value={photoUrl}
                            name={[firstName, lastName].filter(Boolean).join(' ')}
                            size={96}
                        />
                        <AssetWidget
                            id="access-profile-photo"
                            name="photoUrl"
                            schema={
                                {
                                    title: 'Photograph',
                                    widget: {
                                        type: 'asset',
                                        namespace: PARTY_NAMESPACE,
                                        accept: 'image/*',
                                        variant: 'thumb',
                                    },
                                } as never
                            }
                            value={photoUrl}
                            onChange={value => setPhotoUrl(value ? String(value) : null)}
                            // The field is saved with the form, not on its own: a photograph
                            // chosen and then abandoned is discarded by the widget itself.
                            onBlur={() => undefined}
                        />
                    </div>

                    <form
                        className="access-profile__form"
                        onSubmit={e => {
                            e.preventDefault();
                            void onSave();
                        }}
                    >
                        <div className="field grid">
                            <label
                                htmlFor="access-profile-firstName"
                                className="col-12 md:col-4"
                            >
                                {tr('First Name')}
                            </label>
                            <div className="flex align-items-center col-12 md:col-8">
                                <InputText
                                    id="access-profile-firstName"
                                    name="firstName"
                                    className="w-full"
                                    value={firstName}
                                    onChange={e => setFirstName(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="field grid">
                            <label
                                htmlFor="access-profile-lastName"
                                className="col-12 md:col-4"
                            >
                                {tr('Last Name')}
                            </label>
                            <div className="flex align-items-center col-12 md:col-8">
                                <InputText
                                    id="access-profile-lastName"
                                    name="lastName"
                                    className="w-full"
                                    value={lastName}
                                    onChange={e => setLastName(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="field grid">
                            <label
                                htmlFor="access-profile-email"
                                className="col-12 md:col-4"
                            >
                                {tr('Email')}
                            </label>
                            <div className="flex align-items-center col-12 md:col-8">
                                <InputText
                                    id="access-profile-email"
                                    name="emailAddress"
                                    className="w-full"
                                    value={emailAddress}
                                    onChange={e => setEmailAddress(e.target.value)}
                                />
                            </div>
                        </div>
                        <div className="field grid">
                            <label
                                htmlFor="access-profile-language"
                                className="col-12 md:col-4"
                            >
                                {tr('Preferred Language')}
                            </label>
                            <div className="flex align-items-center col-12 md:col-8">
                                <Dropdown
                                    id="access-profile-language"
                                    name="preferredLanguage"
                                    className="w-full"
                                    value={preferredLanguage}
                                    options={LANGUAGES}
                                    onChange={e => setPreferredLanguage(e.target.value)}
                                />
                            </div>
                        </div>
                        {saveError && (
                            <Message
                                severity="error"
                                text={saveError}
                                className="access-profile__msg"
                            />
                        )}
                        {saved && (
                            <Message
                                severity="success"
                                text={tr('Profile saved')}
                                className="access-profile__msg"
                            />
                        )}
                        <div className="access-profile__actions">
                            <Button
                                label={tr('Save')}
                                icon="pi pi-check"
                                loading={saving}
                                disabled={!profile}
                                onClick={() => void onSave()}
                            />
                        </div>
                    </form>
                </Card>

                <Card title={tr('Change Password')}>
                    <form
                        className="access-profile__form"
                        onSubmit={e => {
                            e.preventDefault();
                            void onChangePassword();
                        }}
                    >
                        <div className="field grid">
                            <label
                                htmlFor="access-profile-current"
                                className="col-12 md:col-4"
                            >
                                {tr('Current Password')}
                            </label>
                            <div className="flex align-items-center col-12 md:col-8">
                                <Password
                                    id="access-profile-current"
                                    name="currentPassword"
                                    className="w-full"
                                    value={currentPassword}
                                    onChange={e => setCurrentPassword(e.target.value)}
                                    feedback={false}
                                    toggleMask
                                />
                            </div>
                        </div>
                        <div className="field grid">
                            <label
                                htmlFor="access-profile-new"
                                className="col-12 md:col-4"
                            >
                                {tr('New Password')}
                            </label>
                            <div className="flex align-items-center col-12 md:col-8">
                                <Password
                                    id="access-profile-new"
                                    name="newPassword"
                                    className="w-full"
                                    value={newPassword}
                                    onChange={e => setNewPassword(e.target.value)}
                                    feedback={false}
                                    toggleMask
                                />
                            </div>
                        </div>
                        <div className="field grid">
                            <label
                                htmlFor="access-profile-confirm"
                                className="col-12 md:col-4"
                            >
                                {tr('Confirm New Password')}
                            </label>
                            <div className="flex align-items-center col-12 md:col-8">
                                <Password
                                    id="access-profile-confirm"
                                    name="confirmPassword"
                                    className="w-full"
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    feedback={false}
                                    toggleMask
                                />
                            </div>
                        </div>
                        {pwError && (
                            <Message
                                severity="error"
                                text={pwError}
                                className="access-profile__msg"
                            />
                        )}
                        {pwDone && (
                            <Message
                                severity="success"
                                text={tr('Password changed')}
                                className="access-profile__msg"
                            />
                        )}
                        <div className="access-profile__actions">
                            <Button
                                label={tr('Change Password')}
                                icon="pi pi-key"
                                loading={changing}
                                disabled={!profile}
                                onClick={() => void onChangePassword()}
                            />
                        </div>
                    </form>
                </Card>
            </div>

            {/* Right column — read-only roles */}
            <div className="col-12 xl:col-6">
                <Card title={tr('Roles')}>
                    {profile && profile.roles.length > 0 ? (
                        <ul className="access-profile__roles">
                            {profile.roles.map(role => (
                                <li key={role.roleId}>
                                    <i className="pi pi-shield" /> {role.roleName}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>{tr('No roles assigned')}</p>
                    )}
                </Card>
            </div>
        </div>
    );
}
