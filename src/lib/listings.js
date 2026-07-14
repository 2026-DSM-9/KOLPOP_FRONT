import { normalizeApiErrorMessage } from "./apiError.js";
import { fetchWithAuth } from "./auth.js";

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/+$/, "");

class ListingsApiError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "ListingsApiError";
    this.code = code;
  }
}

const getApiBaseUrl = () => {
  if (!API_BASE_URL) {
    throw new ListingsApiError("API 주소가 설정되지 않았습니다. .env.local의 BASE_URL을 확인해주세요.");
  }

  return API_BASE_URL;
};

const requestListings = async (path, { method = "GET", searchParams = {}, body, auth = false } = {}) => {
  const url = new URL(`${getApiBaseUrl()}${path}`);

  Object.entries(searchParams).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") {
      return;
    }

    url.searchParams.set(key, `${value}`);
  });

  const requestOptions = {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  };
  const response = auth ? await fetchWithAuth(url, requestOptions) : await fetch(url, requestOptions);

  const payload = await response.json().catch(() => null);
  const apiError = payload?.error;

  if (!response.ok || payload?.success === false) {
    throw new ListingsApiError(
      normalizeApiErrorMessage(apiError?.message, "매물 정보를 불러오지 못했습니다."),
      apiError?.code,
    );
  }

  return payload?.data;
};

const normalizeMapListing = (listing) => {
  const listingId = Number(listing.listingId);
  const fallbackId = Number.isFinite(listingId) ? listingId : Date.now();

  return {
    id: fallbackId,
    title: listing.title || "",
    category: "기타",
    address: listing.address || "",
    price: Number(listing.dailyFee) || 0,
    deposit: Number(listing.deposit) || 0,
    area: "",
    views: 0,
    image: "",
    status: listing.status?.label || "모집중",
    favorite: false,
    quickAdded: false,
    lat: Number(listing.latitude),
    lng: Number(listing.longitude),
  };
};

const normalizeListListing = (listing, ownedByMe = false) => {
  const listingId = Number(listing.listingId);
  const fallbackId = Number.isFinite(listingId) ? listingId : Date.now();

  return {
    id: fallbackId,
    title: listing.title || "",
    category: "기타",
    address: listing.address || "",
    price: Number(listing.dailyFee) || 0,
    deposit: Number(listing.deposit) || 0,
    area: listing.area === null || listing.area === undefined ? "" : `${listing.area}㎡`,
    views: Number(listing.viewCount) || 0,
    reservationCount: Number(listing.reservationCount) || 0,
    image: listing.thumbnailUrl || "",
    gallery: listing.thumbnailUrl ? [listing.thumbnailUrl] : [],
    status: listing.status?.label || "모집중",
    favorite: false,
    quickAdded: false,
    lat: Number(listing.latitude),
    lng: Number(listing.longitude),
    ownedByMe,
  };
};

const normalizeDetailListing = (listing) => {
  const listingId = Number(listing.listingId);
  const fallbackId = Number.isFinite(listingId) ? listingId : Date.now();
  const imageUrls = Array.isArray(listing.imageUrls) ? listing.imageUrls.filter(Boolean) : [];
  const restrictions = [
    ...(Array.isArray(listing.industryRestrictions) ? listing.industryRestrictions : []),
    ...(Array.isArray(listing.additionalRestrictions) ? listing.additionalRestrictions : []),
  ].filter(Boolean);

  return {
    id: fallbackId,
    title: listing.title || "",
    category: "기타",
    address: listing.address || "",
    detailAddress: listing.detailAddress || "",
    price: Number(listing.dailyFee) || 0,
    deposit: Number(listing.deposit) || 0,
    area: listing.area === null || listing.area === undefined ? "" : `${listing.area}㎡`,
    views: Number(listing.viewCount) || 0,
    reservationCount: Number(listing.reservationCount) || 0,
    sevenDayTotalFee: Number(listing.sevenDayTotalFee) || 0,
    image: imageUrls[0] || "",
    gallery: imageUrls,
    status: listing.status?.label || "모집중",
    favorite: false,
    quickAdded: false,
    lat: Number(listing.latitude),
    lng: Number(listing.longitude),
    landlordId: listing.landlordId ?? listing.landlord?.id ?? null,
    landlordName: listing.landlordName || "",
    availableFrom: listing.operatingStartDate || "",
    availableTo: listing.operatingEndDate || "",
    minDays: listing.minOperatingDays === null || listing.minOperatingDays === undefined ? "" : `${listing.minOperatingDays}`,
    maxDays: listing.maxOperatingDays === null || listing.maxOperatingDays === undefined ? "" : `${listing.maxOperatingDays}`,
    facilities: Array.isArray(listing.facilities) ? listing.facilities.filter(Boolean) : [],
    restrictions,
    description: listing.description || "",
    hashtags: Array.isArray(listing.hashtags)
      ? listing.hashtags.map((tag) => `${tag}`.replace(/^#+/, "").trim()).filter(Boolean)
      : [],
  };
};

export const fetchListingsForDiscovery = async ({ bounds = {}, keyword = "", sort = "" } = {}) => {
  const data = await requestListings("/listings/discovery", {
    searchParams: {
      ...bounds,
      keyword: keyword.trim(),
      sort,
    },
  });
  const mapListings = Array.isArray(data?.map?.listings)
    ? data.map.listings
        .map(normalizeMapListing)
        .filter((listing) => Number.isFinite(listing.lat) && Number.isFinite(listing.lng))
    : [];
  const mapListingById = new Map(mapListings.map((listing) => [listing.id, listing]));
  const nearbyListings = Array.isArray(data?.nearbyListings?.listings)
    ? data.nearbyListings.listings.map((listing) => {
        const normalizedListing = normalizeListListing(listing);
        const mapListing = mapListingById.get(normalizedListing.id);

        return {
          ...mapListing,
          ...normalizedListing,
          lat: mapListing?.lat ?? normalizedListing.lat,
          lng: mapListing?.lng ?? normalizedListing.lng,
        };
      })
    : [];

  return {
    map: {
      count: Number(data?.map?.count) || 0,
      listings: mapListings,
    },
    nearbyListings: {
      count: Number(data?.nearbyListings?.count) || 0,
      listings: nearbyListings,
    },
  };
};

export const fetchListingDetail = async (listingId) => {
  const data = await requestListings(`/listings/${listingId}`);
  return normalizeDetailListing(data ?? {});
};

export const fetchMyListings = async () => {
  const data = await requestListings("/listings/my", { auth: true });

  return {
    count: Number(data?.count) || 0,
    listings: Array.isArray(data?.listings)
      ? data.listings.map((listing) => normalizeListListing(listing, true))
      : [],
  };
};

export const createListing = async (payload) =>
  requestListings("/listings", {
    method: "POST",
    body: payload,
    auth: true,
  });

export const updateListingRequest = async (listingId, payload) =>
  requestListings(`/listings/${listingId}`, {
    method: "PUT",
    body: payload,
    auth: true,
  });

export const deleteListingRequest = async (listingId) =>
  requestListings(`/listings/${listingId}`, {
    method: "DELETE",
    auth: true,
  });

export const closeListingRequest = async (listingId) =>
  requestListings(`/listings/${listingId}/close`, {
    method: "PATCH",
    auth: true,
  });
