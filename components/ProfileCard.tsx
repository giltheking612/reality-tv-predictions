interface ProfileCardProps {
  profile: { display_name: string; avatar_url: string | null }
}

export default function ProfileCard({ profile }: ProfileCardProps) {
  const initial = profile.display_name.charAt(0).toUpperCase()

  return (
    <div className="flex items-center gap-4">
      {profile.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={profile.avatar_url}
          alt={profile.display_name}
          className="w-16 h-16 rounded-full object-cover ring-2 ring-indigo-200"
        />
      ) : (
        <div className="w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center text-white text-2xl font-bold ring-2 ring-indigo-200">
          {initial}
        </div>
      )}
      <div>
        <h2 className="text-xl font-bold text-gray-900">{profile.display_name}</h2>
      </div>
    </div>
  )
}
