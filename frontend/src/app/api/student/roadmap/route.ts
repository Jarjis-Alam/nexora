import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getStudentPlacementRoadmap } from "@/server/roadmap";

export async function GET(_request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized: Authentication required" },
      { status: 401 }
    );
  }

  // Security barrier: Students can ONLY request their own placement roadmap.
  // Query parameter spoofing/impersonation is strictly rejected.
  const userId = session.user.id;

  try {
    const roadmap = await getStudentPlacementRoadmap(userId);
    return NextResponse.json(roadmap);
  } catch (error) {
    console.error("Failed to generate student placement roadmap:", error);
    return NextResponse.json(
      { error: "Failed to generate student placement roadmap" },
      { status: 500 }
    );
  }
}
