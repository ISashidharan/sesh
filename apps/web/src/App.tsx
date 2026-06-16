import { createBrowserRouter, Navigate } from "react-router-dom";
import { AdminLayout } from "./admin/AdminLayout";
import { CalendarsPage } from "./admin/CalendarsPage";
import { SeshTypesPage } from "./admin/SeshTypesPage";
import { SeshesPage } from "./admin/SeshesPage";
import { WorkingHoursPage } from "./admin/WorkingHoursPage";
import { BookingPage } from "./public/BookingPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AdminLayout />,
    children: [
      { index: true, element: <Navigate to="/calendars" replace /> },
      { path: "calendars", element: <CalendarsPage /> },
      { path: "calendars/:id/hours", element: <WorkingHoursPage /> },
      { path: "sesh-types", element: <SeshTypesPage /> },
      { path: "seshes", element: <SeshesPage /> },
    ],
  },
  { path: "/book/:slug", element: <BookingPage /> },
]);
