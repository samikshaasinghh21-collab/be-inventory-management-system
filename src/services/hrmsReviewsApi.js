import api from "./api";

const emitHrmsReviewsChange = () => {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("hrms:reviews:changed"));
  }
};

export const normalizeHrmsReview = (review = {}) => {
  const id = review.id ?? review.Id ?? "";
  const employeeId = review.employeeId ?? review.EmployeeID ?? "";
  const employeeName =
    review.employeeName ??
    review.FullName ??
    review.fullName ??
    review.EmployeeName ??
    employeeId;

  return {
    ...review,
    id: String(id),
    employeeId,
    employeeName,
    period: review.period ?? review.ReviewPeriod ?? "",
    type: review.type ?? review.ReviewType ?? "",
    reviewer: review.reviewer ?? review.Reviewer ?? "",
    rating: Number(review.rating ?? review.OverallRating ?? 0) || 0,
    strengths: review.strengths ?? review.Strengths ?? "",
    improvement:
      review.improvement ?? review.AreasOfImprovement ?? "",
    comments: review.comments ?? review.Comments ?? "",
    savedAt: review.savedAt ?? review.SavedDate ?? null,
  };
};

export const fetchHrmsReviews = async () => {
  const response = await api.get("/hrms/reviews");
  const list = Array.isArray(response.data?.reviews)
    ? response.data.reviews
    : Array.isArray(response.data)
      ? response.data
      : [];
  return list.map(normalizeHrmsReview);
};

export const createHrmsReview = async (payload) => {
  const response = await api.post("/hrms/reviews", payload);
  const normalized = normalizeHrmsReview(response.data?.review ?? response.data);
  emitHrmsReviewsChange();
  return normalized;
};

export const getHrmsReviewErrorMessage = (
  error,
  fallback = "HRMS review request failed."
) =>
  error?.response?.data?.error ||
  error?.response?.data?.message ||
  error?.message ||
  fallback;
