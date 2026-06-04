import { describe, test, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAuth } from "../use-auth";

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";

beforeEach(() => {
  vi.clearAllMocks();
  (getAnonWorkData as any).mockReturnValue(null);
});

describe("signIn", () => {
  test("returns result from signInAction", async () => {
    (signInAction as any).mockResolvedValue({ success: false, error: "Invalid credentials" });

    const { result } = renderHook(() => useAuth());
    let returnValue: any;

    await act(async () => {
      returnValue = await result.current.signIn("a@b.com", "wrong");
    });

    expect(returnValue).toEqual({ success: false, error: "Invalid credentials" });
  });

  test("sets isLoading to true while in-flight and false after", async () => {
    let resolveSignIn: (v: any) => void;
    (signInAction as any).mockReturnValue(new Promise((r) => { resolveSignIn = r; }));
    (getProjects as any).mockResolvedValue([]);
    (createProject as any).mockResolvedValue({ id: "new-1" });

    const { result } = renderHook(() => useAuth());

    let signInPromise: Promise<any>;
    act(() => {
      signInPromise = result.current.signIn("a@b.com", "pass");
    });

    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      resolveSignIn!({ success: true });
      await signInPromise;
    });

    expect(result.current.isLoading).toBe(false);
  });

  test("does not call handlePostSignIn when sign-in fails", async () => {
    (signInAction as any).mockResolvedValue({ success: false });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "bad");
    });

    expect(getProjects).not.toHaveBeenCalled();
    expect(createProject).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("signUp", () => {
  test("returns result from signUpAction", async () => {
    (signUpAction as any).mockResolvedValue({ success: false, error: "Email taken" });

    const { result } = renderHook(() => useAuth());
    let returnValue: any;

    await act(async () => {
      returnValue = await result.current.signUp("a@b.com", "pass");
    });

    expect(returnValue).toEqual({ success: false, error: "Email taken" });
  });

  test("does not call handlePostSignIn when sign-up fails", async () => {
    (signUpAction as any).mockResolvedValue({ success: false });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signUp("a@b.com", "pass");
    });

    expect(getProjects).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("handlePostSignIn — anon work exists", () => {
  test("creates project from anon work, clears it, and redirects", async () => {
    const anonMessages = [{ id: "m1", role: "user", content: "hello" }];
    const anonFsData = { "/App.jsx": { type: "file", name: "App.jsx", path: "/App.jsx" } };
    (getAnonWorkData as any).mockReturnValue({ messages: anonMessages, fileSystemData: anonFsData });
    (signInAction as any).mockResolvedValue({ success: true });
    (createProject as any).mockResolvedValue({ id: "anon-project-1" });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "pass");
    });

    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: anonMessages, data: anonFsData })
    );
    expect(clearAnonWork).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/anon-project-1");
    expect(getProjects).not.toHaveBeenCalled();
  });

  test("skips anon work migration if messages array is empty", async () => {
    (getAnonWorkData as any).mockReturnValue({ messages: [], fileSystemData: {} });
    (signInAction as any).mockResolvedValue({ success: true });
    (getProjects as any).mockResolvedValue([{ id: "existing-1" }]);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "pass");
    });

    expect(clearAnonWork).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/existing-1");
  });
});

describe("handlePostSignIn — no anon work", () => {
  test("redirects to most recent existing project", async () => {
    (signInAction as any).mockResolvedValue({ success: true });
    (getProjects as any).mockResolvedValue([{ id: "proj-1" }, { id: "proj-2" }]);

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "pass");
    });

    expect(mockPush).toHaveBeenCalledWith("/proj-1");
    expect(createProject).not.toHaveBeenCalled();
  });

  test("creates new project and redirects when user has no projects", async () => {
    (signInAction as any).mockResolvedValue({ success: true });
    (getProjects as any).mockResolvedValue([]);
    (createProject as any).mockResolvedValue({ id: "brand-new" });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.signIn("a@b.com", "pass");
    });

    expect(createProject).toHaveBeenCalledWith(
      expect.objectContaining({ messages: [], data: {} })
    );
    expect(mockPush).toHaveBeenCalledWith("/brand-new");
  });
});
