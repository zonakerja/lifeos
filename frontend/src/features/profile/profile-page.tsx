import { ModulePage } from "@/components/layout/module-page";
import { ProfileForm } from "@/features/profile/profile-form";

/** Profil Saya: dibuka dari menu user di sidebar (bukan bagian Pengaturan). */
export function Component() {
  return (
    <ModulePage module="profile">
      <div className="mx-auto w-full max-w-4xl">
        <ProfileForm />
      </div>
    </ModulePage>
  );
}
