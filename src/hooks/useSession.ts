import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "astrobee_session_id";

interface SessionState {
  sessionId: string | null;
  currentScene: number;
  status: "in_progress" | "completed";
  currentResponse: string;
  isLoading: boolean;
  error: string | null;
}

export function useSession() {
  const [state, setState] = useState<SessionState>({
    sessionId: null,
    currentScene: 1,
    status: "in_progress",
    currentResponse: "",
    isLoading: true,
    error: null,
  });

  // Create a new session
  const createSession = useCallback(async (): Promise<string | null> => {
    const { data, error } = await supabase
      .from("sessions")
      .insert({ current_scene: 1, status: "in_progress" })
      .select("id")
      .single();

    if (error) {
      console.error("Error creating session:", error);
      setState((prev) => ({ ...prev, error: error.message, isLoading: false }));
      return null;
    }

    localStorage.setItem(SESSION_KEY, data.id);
    return data.id;
  }, []);

  // Fetch session state from backend
  const fetchSessionState = useCallback(async (sessionId: string) => {
    // Fetch session
    const { data: session, error: sessionError } = await supabase
      .from("sessions")
      .select("current_scene, status")
      .eq("id", sessionId)
      .maybeSingle();

    if (sessionError || !session) {
      // Session not found, create new one
      localStorage.removeItem(SESSION_KEY);
      const newSessionId = await createSession();
      if (newSessionId) {
        setState({
          sessionId: newSessionId,
          currentScene: 1,
          status: "in_progress",
          currentResponse: "",
          isLoading: false,
          error: null,
        });
      }
      return;
    }

    // Fetch response for current scene
    const { data: response } = await supabase
      .from("responses")
      .select("user_text")
      .eq("session_id", sessionId)
      .eq("scene_number", session.current_scene)
      .maybeSingle();

    setState({
      sessionId,
      currentScene: session.current_scene,
      status: session.status as "in_progress" | "completed",
      currentResponse: response?.user_text || "",
      isLoading: false,
      error: null,
    });
  }, [createSession]);

  // Initialize session on mount
  useEffect(() => {
    const initSession = async () => {
      const storedSessionId = localStorage.getItem(SESSION_KEY);

      if (storedSessionId) {
        await fetchSessionState(storedSessionId);
      } else {
        const newSessionId = await createSession();
        if (newSessionId) {
          setState({
            sessionId: newSessionId,
            currentScene: 1,
            status: "in_progress",
            currentResponse: "",
            isLoading: false,
            error: null,
          });
        }
      }
    };

    initSession();
  }, [createSession, fetchSessionState]);

  // Save response and advance to next scene
  const saveResponseAndAdvance = useCallback(
    async (userText: string, sceneNumber: number) => {
      if (!state.sessionId) return false;

      const isLastScene = sceneNumber === 12;
      const nextScene = isLastScene ? 12 : sceneNumber + 1;
      const nextStatus = isLastScene ? "completed" : "in_progress";

      // Upsert response
      const { error: responseError } = await supabase
        .from("responses")
        .upsert(
          {
            session_id: state.sessionId,
            scene_number: sceneNumber,
            user_text: userText,
          },
          { onConflict: "session_id,scene_number" }
        );

      if (responseError) {
        console.error("Error saving response:", responseError);
        setState((prev) => ({ ...prev, error: responseError.message }));
        return false;
      }

      // Update session
      const { error: sessionError } = await supabase
        .from("sessions")
        .update({ current_scene: nextScene, status: nextStatus })
        .eq("id", state.sessionId);

      if (sessionError) {
        console.error("Error updating session:", sessionError);
        setState((prev) => ({ ...prev, error: sessionError.message }));
        return false;
      }

      // Fetch next scene's response if exists
      let nextResponse = "";
      if (!isLastScene) {
        const { data: existingResponse } = await supabase
          .from("responses")
          .select("user_text")
          .eq("session_id", state.sessionId)
          .eq("scene_number", nextScene)
          .maybeSingle();
        nextResponse = existingResponse?.user_text || "";
      }

      setState((prev) => ({
        ...prev,
        currentScene: nextScene,
        status: nextStatus,
        currentResponse: nextResponse,
      }));

      return true;
    },
    [state.sessionId]
  );

  return {
    ...state,
    saveResponseAndAdvance,
  };
}
