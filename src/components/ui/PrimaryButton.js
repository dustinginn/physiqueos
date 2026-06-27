import { Button } from "@/components/ui/button";

export default function PrimaryButton({ children, onClick }) {
  return (
    <Button
      onClick={onClick}
      className="mt-6"
    >
      {children}
    </Button>
  );
}