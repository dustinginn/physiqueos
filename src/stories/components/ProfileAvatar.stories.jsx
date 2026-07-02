import ProfileAvatar from "../../components/layout/ProfileAvatar";

const meta = {
  title: "Components/ProfileAvatar",
  component: ProfileAvatar,
};

export default meta;

export const Image = {
  render: () => (
    <ProfileAvatar
      alt="Dustin profile photo"
      initials="D"
      src="https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=200&q=80"
    />
  ),
};

export const Initials = {
  render: () => <ProfileAvatar initials="D" />,
};
