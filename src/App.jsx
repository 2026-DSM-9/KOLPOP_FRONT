import { useCallback, useEffect, useRef, useState } from "react";
import { useKakaoMap } from "./hooks/useKakaoMap.js";
import {
  getKakaoMapErrorMessage,
  getKakaoServiceErrorMessage,
  loadKakaoMapsSdk,
  loadKakaoPostcodeSdk,
} from "./lib/kakao.js";
import {
  checkLoginId,
  clearAuthSession,
  getSavedAuthSession,
  loginLandlord,
  saveAuthSession,
  sendSignupCode,
  signupLandlord,
  verifySignupCode,
} from "./lib/auth.js";
import {
  closeListingRequest,
  createListing,
  deleteListingRequest,
  fetchListingDetail,
  fetchListingsForDiscovery,
  fetchMyListings,
  updateListingRequest,
} from "./lib/listings.js";
import { uploadFile } from "./lib/files.js";
import { createChatRoom, fetchChatMessages, fetchChatRooms } from "./lib/chat.js";
import { fetchMyPage, updateMyPage } from "./lib/mypage.js";
import {
  approveReservationRequest,
  fetchManagementReservations,
  rejectReservationRequest,
} from "./lib/reservations.js";
import {
  createChatSocket,
  normalizeSocketMessage,
  sendChatSocketMessage,
} from "./lib/chatSocket.js";

const facilityOptions = [
  "와이파이",
  "에어컨",
  "조명",
  "카운터",
  "창고",
  "주방",
  "냉장고",
  "테라스",
  "테이블",
  "의자",
  "화장실",
  "주차장",
  "피팅룸",
  "행거",
  "세면대",
  "대형거울",
  "오븐",
  "프로젝터",
  "음향시설",
  "조명레일",
  "마당",
  "보안시스템",
  "VIP룸",
  "발렛파킹",
  "엘리베이터",
];
const restrictionOptions = [
  "없음",
  "주류 판매 불가",
  "육류 취급 불가",
  "염색약 사용 불가",
  "소음 발생 업종 제한",
  "심야 영업 제한 (24시까지)",
];
const navItems = [
  { label: "홈", page: "home", icon: "home" },
  { label: "매물 등록", page: "register", icon: "plus" },
  { label: "예약 관리", page: "reservation", icon: "calendar" },
  { label: "채팅", page: "chat", icon: "chat" },
  { label: "마이페이지", page: "mypage", icon: "user" },
];
const protectedPages = new Set(["register", "reservation", "chat", "mypage"]);
const priceStep = 10000;
const depositStep = 100000;
const myProfileSeed = {
  name: "",
  email: "",
  phone: "",
  address: "",
  detailAddress: "",
  bio: "",
};
const defaultMyListingIds = [];
const myListingReservationCounts = {};
const reservationStatusMeta = {
  pending: {
    label: "승인 대기",
    className: "is-pending",
  },
  approved: {
    label: "승인 완료",
    className: "is-approved",
  },
  rejected: {
    label: "거절됨",
    className: "is-rejected",
  },
};
const categoryFacilityDefaults = {
  패션: ["와이파이", "행거", "피팅룸", "조명", "대형거울"],
  카페: ["와이파이", "에어컨", "테이블", "의자", "카운터"],
  음식점: ["주방", "냉장고", "테이블", "의자", "화장실"],
  전시: ["조명", "프로젝터", "음향시설", "창고", "와이파이"],
  플리마켓: ["테이블", "의자", "와이파이", "조명", "창고"],
  뷰티: ["와이파이", "세면대", "대형거울", "조명", "에어컨"],
  기타: ["와이파이", "에어컨", "창고"],
};
const categoryRestrictionDefaults = {
  음식점: ["없음"],
  뷰티: ["염색약 사용 불가"],
  전시: ["없음"],
  패션: ["없음"],
  카페: ["주류 판매 불가"],
  플리마켓: ["없음"],
  기타: ["소음 발생 업종 제한"],
};

const formatPrice = (value) => value.toLocaleString("ko-KR");
const formatViews = (value) => value.toLocaleString("ko-KR");
const formatNumber = (value) => value.toLocaleString("ko-KR");
const normalizeUsername = (value) => value.trim().toLowerCase();
const sanitizeNumericInput = (value) => value.replace(/[^\d]/g, "");
const normalizeHashtag = (value) => value.replace(/^#+/, "").trim();
const parseHashtags = (value) =>
  Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .flatMap((token) => token.split(/\s+/))
        .map(normalizeHashtag)
        .filter(Boolean),
    ),
  ).slice(0, 8);
const getSteppedValue = (value, step, direction) => {
  const parsedValue = Number(sanitizeNumericInput(value) || 0);
  const nextValue = Math.max(0, parsedValue + step * direction);

  return `${nextValue}`;
};
const formatPhoneNumber = (value) => {
  const digits = sanitizeNumericInput(value).slice(0, 11);

  if (digits.length <= 3) {
    return digits;
  }

  if (digits.length <= 7) {
    return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  }

  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
};
const parseCustomEntries = (value) =>
  Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
const splitPresetAndCustomEntries = (items, presetOptions) => {
  const presetSet = new Set(presetOptions);

  return {
    preset: items.filter((item) => presetSet.has(item)),
    custom: items.filter((item) => !presetSet.has(item)),
  };
};
const normalizeAreaValue = (area) => `${area ?? ""}`.replace(/[^\d.]/g, "");
const formatHashtagInput = (hashtags) => hashtags.join(", ");
const enrichListing = (listing) => ({
  ...listing,
  facilities:
    listing.facilities && listing.facilities.length > 0
      ? listing.facilities
      : categoryFacilityDefaults[listing.category] ?? categoryFacilityDefaults.기타,
  restrictions:
    listing.restrictions && listing.restrictions.length > 0
      ? listing.restrictions
      : categoryRestrictionDefaults[listing.category] ?? ["없음"],
  availableFrom: listing.availableFrom ?? "",
  availableTo: listing.availableTo ?? "",
  minDays: listing.minDays ?? "",
  maxDays: listing.maxDays ?? "",
  description: listing.description?.trim() || "",
  hashtags:
    listing.hashtags && listing.hashtags.length > 0
      ? listing.hashtags.map(normalizeHashtag)
      : [],
  gallery:
    listing.gallery && listing.gallery.length > 0
      ? Array.from(new Set(listing.gallery))
      : listing.image
        ? [listing.image]
        : [],
});

const createInitialRegistrationForm = () => ({
  title: "",
  address: "",
  detailAddress: "",
  lat: "",
  lng: "",
  price: "150000",
  deposit: "1000000",
  area: "66.1",
  facilities: [],
  customFacilities: [],
  facilityDraft: "",
  restrictions: ["없음"],
  customRestrictions: [],
  restrictionDraft: "",
  availableFrom: "",
  availableTo: "",
  minDays: "1",
  maxDays: "7",
  description: "",
  hashtags: "",
});
const createRegistrationFormFromListing = (listing) => {
  const facilityEntries = splitPresetAndCustomEntries(listing.facilities ?? [], facilityOptions);
  const restrictionEntries = splitPresetAndCustomEntries(listing.restrictions ?? [], restrictionOptions);
  const nextRestrictions =
    restrictionEntries.preset.length > 0
      ? restrictionEntries.preset
      : restrictionEntries.custom
        ? []
        : ["없음"];

  return {
    ...createInitialRegistrationForm(),
    title: listing.title ?? "",
    address: listing.baseAddress ?? listing.address ?? "",
    detailAddress: listing.detailAddress ?? "",
    lat: listing.lat !== undefined ? `${listing.lat}` : "",
    lng: listing.lng !== undefined ? `${listing.lng}` : "",
    price: listing.price !== undefined ? `${listing.price}` : "150000",
    deposit: listing.deposit !== undefined ? `${listing.deposit}` : "1000000",
    area: normalizeAreaValue(listing.area),
    facilities: facilityEntries.preset,
    customFacilities: facilityEntries.custom,
    facilityDraft: "",
    restrictions: nextRestrictions,
    customRestrictions: restrictionEntries.custom,
    restrictionDraft: "",
    availableFrom: listing.availableFrom ?? "",
    availableTo: listing.availableTo ?? "",
    minDays: listing.minDays ?? "1",
    maxDays: listing.maxDays ?? "7",
    description: listing.description ?? "",
    hashtags: formatHashtagInput(listing.hashtags ?? []),
  };
};

const createListingPayload = (draft) => ({
  title: draft.title,
  imageUrls: draft.gallery?.length > 0 ? draft.gallery : draft.image ? [draft.image] : [],
  address: draft.baseAddress || draft.address,
  detailAddress: draft.detailAddress,
  latitude: Number(draft.lat) || 0,
  longitude: Number(draft.lng) || 0,
  dailyFee: Number(draft.price) || 0,
  deposit: Number(draft.deposit) || 0,
  area: Number(normalizeAreaValue(draft.area)) || 0,
  facilities: draft.facilities ?? [],
  industryRestrictions: draft.industryRestrictions ?? [],
  additionalRestrictions: draft.additionalRestrictions ?? [],
  operatingStartDate: draft.availableFrom,
  operatingEndDate: draft.availableTo,
  minOperatingDays: Number(draft.minDays) || 0,
  maxOperatingDays: Number(draft.maxDays) || 0,
  description: draft.description,
  hashtags: draft.hashtags ?? [],
});

const resolveListingImageUrls = async (imagePreviews = []) => {
  const uploadedImages = await Promise.all(
    imagePreviews.map(async (preview) => {
      if (preview.file) {
        const uploadedFile = await uploadFile(preview.file);
        return uploadedFile?.url || "";
      }

      return preview.url || preview.src || "";
    }),
  );

  return uploadedImages.filter(Boolean);
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

const buildSelectedAddress = (data) => {
  const address = data.userSelectedType === "R" ? data.roadAddress : data.jibunAddress;

  if (data.userSelectedType !== "R") {
    return address;
  }

  const extraParts = [];

  if (data.bname && /[동로가]$/.test(data.bname)) {
    extraParts.push(data.bname);
  }

  if (data.buildingName && data.apartment === "Y") {
    extraParts.push(data.buildingName);
  }

  return extraParts.length > 0 ? `${address} (${extraParts.join(", ")})` : address;
};

const geocodeAddress = async (appKey, address) => {
  const kakao = await loadKakaoMapsSdk(appKey);

  if (!kakao.maps.services?.Geocoder) {
    throw new Error(getKakaoServiceErrorMessage());
  }

  return new Promise((resolve, reject) => {
    const geocoder = new kakao.maps.services.Geocoder();

    geocoder.addressSearch(address, (result, status) => {
      if (status === kakao.maps.services.Status.OK && result?.[0]) {
        resolve({
          lat: result[0].y,
          lng: result[0].x,
        });
        return;
      }

      reject(new Error(getKakaoServiceErrorMessage()));
    });
  });
};

function NavIcon({ type }) {
  const icons = {
    home: (
      <path
        d="M4 10.75 12 4l8 6.75V20a1 1 0 0 1-1 1h-4.5v-6.25h-5V21H5a1 1 0 0 1-1-1z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    ),
    plus: (
      <>
        <path
          d="M12 5v14M5 12h14"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.75"
        />
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.75" />
      </>
    ),
    calendar: (
      <>
        <path
          d="M7 3v3M17 3v3M4 9h16M6 6h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
        <path
          d="m9 14 2 2 4-4"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
      </>
    ),
    arrowLeft: (
      <path
        d="M15 5 8 12l7 7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    ),
    chevronLeft: (
      <path
        d="M14.5 6.5 9 12l5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    ),
    chevronRight: (
      <path
        d="M9.5 6.5 15 12l-5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    ),
    chat: (
      <path
        d="M7 18.5c-1.05.5-2.4 1-4 1.5.76-1.36 1.2-2.65 1.4-3.7A8 8 0 1 1 20 12a7.95 7.95 0 0 1-7.4 7.97"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    ),
    user: (
      <path
        d="M12 13a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm-7 7a7 7 0 0 1 14 0"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.75"
      />
    ),
    phone: (
      <>
        <rect
          x="7.2"
          y="3.6"
          width="9.6"
          height="16.8"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
        <path
          d="M10.2 6.4h3.6"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.75"
        />
        <circle cx="12" cy="17.2" r="0.8" fill="currentColor" />
      </>
    ),
    clock: (
      <>
        <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path
          d="M12 7.8v4.4l2.9 1.8"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </>
    ),
    search: (
      <>
        <circle cx="11" cy="11" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="m16 16 4 4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.8" />
      </>
    ),
    heart: (
      <path
        d="M12 20.2 4.9 13.6A4.64 4.64 0 0 1 11.3 6.9L12 7.6l.7-.7a4.64 4.64 0 0 1 6.4 6.7Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    ),
    add: (
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    ),
    camera: (
      <>
        <path
          d="M6.2 7.5h2.25l1.1-1.7h4.9l1.1 1.7h2.24A2.2 2.2 0 0 1 20 9.7v7.1A2.2 2.2 0 0 1 17.8 19H6.2A2.2 2.2 0 0 1 4 16.8V9.7A2.2 2.2 0 0 1 6.2 7.5Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
        <circle cx="12" cy="13.15" r="3.35" fill="none" stroke="currentColor" strokeWidth="1.75" />
      </>
    ),
    image: (
      <>
        <rect
          x="4.5"
          y="5"
          width="15"
          height="14"
          rx="2"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <circle cx="9" cy="10" r="1.4" fill="currentColor" />
        <path
          d="m6.8 16.2 3.2-3 2.2 2.05 2.3-2.3 2.5 3.25"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </>
    ),
    send: (
      <path
        d="m4 19 16-7L4 5l2.9 6.05L20 12 6.9 12.95Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
    ),
    external: (
      <>
        <path
          d="M14 5h5v5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
        <path
          d="M10 14 19 5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
        <path
          d="M19 12.5V18a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5.5"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.75"
        />
      </>
    ),
    eye: (
      <>
        <path
          d="M2.5 12S6.15 6.5 12 6.5 21.5 12 21.5 12 17.85 17.5 12 17.5 2.5 12 2.5 12Z"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <circle cx="12" cy="12" r="2.9" fill="none" stroke="currentColor" strokeWidth="1.7" />
      </>
    ),
    eyeOff: (
      <>
        <path
          d="M4 4 20 20"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="M10.6 6.8c.46-.1.93-.15 1.4-.15 5.85 0 9.5 5.35 9.5 5.35a18.5 18.5 0 0 1-3.67 3.94"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="M14.95 14.96A4 4 0 0 1 9.04 9.05"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
        <path
          d="M6.24 8.3A18.72 18.72 0 0 0 2.5 12S6.15 17.5 12 17.5c.77 0 1.5-.09 2.19-.25"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.7"
        />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {icons[type]}
    </svg>
  );
}

function SiteHeader({ currentPage, isAuthenticated, onNavigate, onLogout }) {
  return (
    <header className="site-header">
      <div className="header-shell">
        <button className="brand" type="button" aria-label="콜팝 홈" onClick={() => onNavigate("home")}>
          <span className="brand__mark">콜팝</span>
        </button>

        <nav className="main-nav" aria-label="주요 메뉴">
          {navItems.map((item) => (
            <button
              key={item.label}
              className={`main-nav__item ${item.page === currentPage ? "is-active" : ""}`}
              type="button"
              aria-current={item.page === currentPage ? "page" : undefined}
              onClick={() => {
                if (item.page) {
                  onNavigate(item.page);
                }
              }}
            >
              <NavIcon type={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {isAuthenticated ? (
          <div className="header-actions">
            <button className="header-actions__button" type="button" onClick={onLogout}>
              로그아웃
            </button>
          </div>
        ) : (
          <div className="header-actions">
            <button className="header-actions__link" type="button" onClick={() => onNavigate("login")}>
              로그인
            </button>
            <button className="header-actions__button" type="button" onClick={() => onNavigate("signup")}>
              회원가입
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function ListingCard({ listing, active, onSelect, onOpenDetail }) {
  const recruiting = listing.status === "모집중";
  const handleOpenDetail = () => {
    onSelect(listing.id);
    onOpenDetail(listing.id);
  };

  return (
    <article
      className={`listing-card ${active ? "is-active" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`${listing.title} 상세 보기`}
      onClick={handleOpenDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenDetail();
        }
      }}
    >
      <div className="listing-card__media">
        {listing.image ? <img src={listing.image} alt={listing.title} loading="lazy" /> : null}
        <span className={`listing-card__status ${recruiting ? "" : "is-secondary"}`}>{listing.status}</span>
      </div>
      <div className="listing-card__body">
        <div className="listing-card__top">
          <h3 className="listing-card__title">{listing.title}</h3>
        </div>
        <p className="listing-card__address">{listing.address}</p>
        <div className="listing-card__price-row">
          <div className="listing-card__price">
            <strong>{formatPrice(listing.price)}</strong>
            <span>원/일</span>
          </div>
          <span className="listing-card__area">{listing.area}</span>
        </div>
        <div className="listing-card__meta">
          <p>보증금 {formatPrice(listing.deposit)}원</p>
          <p>조회 {formatViews(listing.views)}</p>
        </div>
      </div>
    </article>
  );
}

function OwnedListingCard({ listing, reservationCount, onEdit, onDelete, onCloseRecruitment, onOpenDetail }) {
  const closed = listing.status === "모집 종료";
  const handleOpenDetail = () => {
    onOpenDetail(listing.id);
  };

  const handleActionClick = (event, callback) => {
    event.stopPropagation();
    callback();
  };

  return (
    <article
      className="owned-listing-card"
      role="button"
      tabIndex={0}
      aria-label={`${listing.title} 상세 보기`}
      onClick={handleOpenDetail}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          handleOpenDetail();
        }
      }}
    >
      <div className="owned-listing-card__media">
        {listing.image ? <img src={listing.image} alt={listing.title} loading="lazy" /> : null}
        <span className={`owned-listing-card__status ${closed ? "is-closed" : ""}`}>{listing.status}</span>
      </div>

      <div className="owned-listing-card__body">
        <h3>{listing.title}</h3>
        <div className="owned-listing-card__price-row">
          <strong>{formatPrice(listing.price)}</strong>
          <span>원/일</span>
        </div>
        <div className="owned-listing-card__meta">
          <span>조회 {formatViews(listing.views)}</span>
          <span>예약 {formatNumber(reservationCount)}</span>
        </div>

        <div className="owned-listing-card__actions">
          <button
            className="owned-listing-card__action"
            type="button"
            onClick={(event) => handleActionClick(event, () => onEdit(listing.id))}
          >
            수정
          </button>
          <button
            className="owned-listing-card__action"
            type="button"
            onClick={(event) => handleActionClick(event, () => onDelete(listing.id))}
          >
            삭제
          </button>
          <button
            className={`owned-listing-card__action owned-listing-card__action--dark ${closed ? "is-disabled" : ""}`}
            type="button"
            onClick={(event) => handleActionClick(event, () => onCloseRecruitment(listing.id))}
            disabled={closed}
          >
            {closed ? "종료됨" : "모집 종료"}
          </button>
        </div>
      </div>
    </article>
  );
}

function MyPage({
  profile,
  listings,
  onCreateListing,
  onEditListing,
  onDeleteListing,
  onCloseRecruitment,
  onOpenDetail,
  onUpdateProfile,
}) {
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileDraft, setProfileDraft] = useState(profile);
  const [profileError, setProfileError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const myListings = listings.filter((listing) => listing.ownedByMe || defaultMyListingIds.includes(listing.id));
  const infoRows = [
    { label: "이름", field: "name", value: profileDraft.name },
    { label: "이메일", field: "email", value: profileDraft.email },
    { label: "휴대폰 번호", field: "phone", value: formatPhoneNumber(profileDraft.phone) },
    { label: "자기소개", field: "bio", value: profileDraft.bio, multiline: true },
  ];

  useEffect(() => {
    setProfileDraft(profile);
  }, [profile]);

  const updateProfileField = (field, value) => {
    setProfileDraft((current) => ({
      ...current,
      [field]: field === "phone" ? formatPhoneNumber(value) : value,
    }));
  };

  const handleSaveProfile = async () => {
    setProfileError("");
    setIsSavingProfile(true);

    try {
      await onUpdateProfile({
        ...profileDraft,
        phone: formatPhoneNumber(profileDraft.phone),
      });
      setIsEditingProfile(false);
    } catch (error) {
      setProfileError(error.message || "회원 정보를 저장하지 못했습니다.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleCancelProfileEdit = () => {
    setProfileDraft(profile);
    setProfileError("");
    setIsEditingProfile(false);
  };

  return (
    <section className="mypage-page">
      <div className="mypage-shell">
        <div className="page-intro mypage-intro">
          <h1>마이페이지</h1>
        </div>

        <div className="mypage-profile">
          <strong>{profile.name}</strong>
          <span>{profile.email}</span>
        </div>

        <section className="mypage-info-card">
          <div className="mypage-info-card__header">
            <h2>회원 정보</h2>
            <div className="mypage-info-card__header-actions">
              {isEditingProfile ? (
                <>
                  <button type="button" disabled={isSavingProfile} onClick={handleSaveProfile}>
                    {isSavingProfile ? "저장 중" : "저장"}
                  </button>
                  <button className="is-secondary" type="button" disabled={isSavingProfile} onClick={handleCancelProfileEdit}>
                    취소
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setIsEditingProfile(true)}>
                  수정
                </button>
              )}
            </div>
          </div>

          {profileError ? <p className="signup-form__error">{profileError}</p> : null}

          <div className="mypage-info-card__rows">
            {infoRows.map((row) => (
              <div key={row.label} className={`mypage-info-card__row ${row.multiline ? "is-multiline" : ""}`}>
                <span>{row.label}</span>
                {isEditingProfile ? (
                  row.multiline ? (
                    <textarea
                      className="mypage-info-card__textarea"
                      rows={4}
                      value={row.value}
                      onChange={(event) => updateProfileField(row.field, event.target.value)}
                    />
                  ) : (
                    <input
                      className="mypage-info-card__input"
                      type="text"
                      inputMode={row.field === "phone" ? "numeric" : undefined}
                      maxLength={row.field === "phone" ? 13 : undefined}
                      value={row.value}
                      onChange={(event) => updateProfileField(row.field, event.target.value)}
                    />
                  )
                ) : (
                  <strong>{row.value}</strong>
                )}
              </div>
            ))}
          </div>
        </section>

        <div className="mypage-divider" />

        <section className="mypage-listings">
          <div className="mypage-listings__header">
            <h2>내 매물</h2>
            <button className="mypage-listings__add" type="button" onClick={onCreateListing}>
              <NavIcon type="plus" />
              <span>매물 등록</span>
            </button>
          </div>

          {myListings.length > 0 ? (
            <div className="owned-listing-grid">
              {myListings.map((listing) => (
                <OwnedListingCard
                  key={listing.id}
                  listing={listing}
                  reservationCount={listing.reservationCount ?? myListingReservationCounts[listing.id] ?? 0}
                  onEdit={onEditListing}
                  onDelete={onDeleteListing}
                  onCloseRecruitment={onCloseRecruitment}
                  onOpenDetail={onOpenDetail}
                />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <p>등록한 매물이 아직 없어요. 첫 매물을 올려보세요.</p>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function DetailLocationMap({ listing, appKey }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapState, setMapState] = useState({
    loading: true,
    error: "",
  });
  const hasCoords = Number.isFinite(Number(listing.lat)) && Number.isFinite(Number(listing.lng));

  useEffect(() => {
    if (!hasCoords) {
      setMapState({
        loading: false,
        error: "위치 좌표가 없어 지도를 표시할 수 없어요.",
      });
      return;
    }

    let cancelled = false;
    setMapState({
      loading: true,
      error: "",
    });

    loadKakaoMapsSdk(appKey)
      .then((kakao) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        const position = new kakao.maps.LatLng(Number(listing.lat), Number(listing.lng));

        if (!mapRef.current) {
          const map = new kakao.maps.Map(containerRef.current, {
            center: position,
            level: 3,
          });

          const marker = new kakao.maps.Marker({
            position,
          });

          marker.setMap(map);
          mapRef.current = map;
          markerRef.current = marker;
        } else {
          mapRef.current.relayout();
          mapRef.current.setCenter(position);
          markerRef.current?.setPosition(position);
        }

        setMapState({
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setMapState({
          loading: false,
          error: error.message || getKakaoMapErrorMessage(),
        });
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, hasCoords, listing.lat, listing.lng]);

  const handleOpenMap = () => {
    if (!hasCoords) {
      return;
    }

    const label = encodeURIComponent(listing.title);
    window.open(`https://map.kakao.com/link/map/${label},${listing.lat},${listing.lng}`, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="detail-map">
      <div className="detail-map__frame">
        <div ref={containerRef} className={`detail-map__canvas ${mapState.error ? "is-hidden" : ""}`} />
        {mapState.loading || mapState.error ? (
          <div className="detail-map__placeholder">
            <p>{mapState.loading ? "지도를 불러오는 중입니다." : mapState.error}</p>
          </div>
        ) : null}
        <button className="detail-map__action" type="button" onClick={handleOpenMap} disabled={!hasCoords}>
          지도에서 열기
          <NavIcon type="external" />
        </button>
      </div>
    </div>
  );
}

function ListingDetailPage({
  listing,
  profile,
  reservationCount,
  isLoading,
  errorMessage,
  appKey,
  onBack,
}) {
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const gallery = listing.gallery?.length > 0 ? listing.gallery : listing.image ? [listing.image] : [];
  const activeImage = gallery[activeImageIndex];
  const sampleDays = Math.min(Number(listing.maxDays) || 7, 7);
  const totalFee = listing.sevenDayTotalFee && sampleDays === 7 ? listing.sevenDayTotalFee : listing.price * sampleDays;

  useEffect(() => {
    setActiveImageIndex(0);
  }, [listing.id]);

  const moveImage = (direction) => {
    setActiveImageIndex((current) => (current + direction + gallery.length) % gallery.length);
  };

  return (
    <section className="detail-page">
      <div className="detail-shell">
        <button className="detail-back-button" type="button" onClick={onBack}>
          <NavIcon type="arrowLeft" />
          <span>뒤로가기</span>
        </button>

        {isLoading || errorMessage ? (
          <div className="detail-status" role="status">
            {isLoading ? "매물 상세 정보를 불러오는 중입니다." : errorMessage}
          </div>
        ) : null}

        <div className="detail-hero">
          <section className="detail-gallery-card">
            <div className="detail-gallery__stage">
              {activeImage ? <img src={activeImage} alt={`${listing.title} 대표 이미지`} /> : null}
              {gallery.length > 1 ? (
                <>
                  <button
                    className="detail-gallery__nav detail-gallery__nav--left"
                    type="button"
                    aria-label="이전 이미지"
                    onClick={() => moveImage(-1)}
                  >
                    <NavIcon type="chevronLeft" />
                  </button>
                  <button
                    className="detail-gallery__nav detail-gallery__nav--right"
                    type="button"
                    aria-label="다음 이미지"
                    onClick={() => moveImage(1)}
                  >
                    <NavIcon type="chevronRight" />
                  </button>
                  <span className="detail-gallery__count">
                    {activeImageIndex + 1}/{gallery.length}
                  </span>
                </>
              ) : null}
            </div>

            <div className="detail-gallery__thumbs">
              {gallery.map((image, index) => (
                <button
                  key={`${image}-${index}`}
                  className={`detail-gallery__thumb ${index === activeImageIndex ? "is-active" : ""}`}
                  type="button"
                  onClick={() => setActiveImageIndex(index)}
                >
                  <img src={image} alt={`${listing.title} 썸네일 ${index + 1}`} />
                </button>
              ))}
            </div>
          </section>

          <aside className="detail-sidebar">
            <section className="detail-side-card">
              <span className="detail-side-card__eyebrow">하루 이용료</span>
              <strong className="detail-side-card__price">{formatPrice(listing.price)}원</strong>
              <div className="detail-side-card__deposit">
                <span>보증금</span>
                <strong>{formatPrice(listing.deposit)}원</strong>
              </div>
            </section>

            <section className="detail-side-card detail-side-card--owner">
              <div className="detail-owner">
                <span className="detail-owner__icon">
                  <NavIcon type="user" />
                </span>
                <div>
                  <strong>{listing.landlordName || profile.name || "임대인"}</strong>
                  <p>임대인 정보</p>
                </div>
              </div>
              <dl className="detail-owner__stats">
                <div>
                  <dt>조회수</dt>
                  <dd>{formatViews(listing.views)}</dd>
                </div>
                <div>
                  <dt>예약 수</dt>
                  <dd>{formatNumber(reservationCount)}</dd>
                </div>
              </dl>
            </section>
          </aside>
        </div>

        <div className="detail-content">
          <div className="detail-heading">
            <div className="detail-heading__badges">
              <span className={`listing-card__status detail-heading__status ${listing.status === "모집중" ? "" : "is-secondary"}`}>
                {listing.status}
              </span>
            </div>
            <h1>{listing.title}</h1>
            <p>{listing.address}</p>
          </div>

          <section className="detail-info-card detail-info-card--grid">
            <h2>가격 정보</h2>
            <div className="detail-info-grid">
              <div>
                <span>보증금</span>
                <strong>{formatPrice(listing.deposit)}원</strong>
              </div>
              <div>
                <span>하루 이용료</span>
                <strong className="is-highlight">{formatPrice(listing.price)}원</strong>
              </div>
              <div>
                <span>면적</span>
                <strong>{listing.area}</strong>
              </div>
              <div>
                <span>총 이용료 ({sampleDays}일 기준)</span>
                <strong>{formatPrice(totalFee)}원</strong>
              </div>
            </div>
          </section>

          <section className="detail-info-card">
            <h2>운영 가능 기간</h2>
            <div className="detail-period-grid">
              <div className="detail-period-item">
                <div className="detail-period-item__icon is-blue">
                  <NavIcon type="calendar" />
                </div>
                <div>
                  <span>이용 가능 기간</span>
                  <strong>
                    {listing.availableFrom} ~ {listing.availableTo}
                  </strong>
                </div>
              </div>
              <div className="detail-period-item">
                <div className="detail-period-item__icon is-orange">
                  <NavIcon type="clock" />
                </div>
                <div>
                  <span>최소/최대 운영 일수</span>
                  <strong>
                    {listing.minDays}일 ~ {listing.maxDays}일
                  </strong>
                </div>
              </div>
            </div>
          </section>

          <section className="detail-info-card">
            <h2>시설</h2>
            <div className="detail-chip-list">
              {listing.facilities.map((facility) => (
                <span key={facility} className="detail-check-chip">
                  <span>✓</span>
                  {facility}
                </span>
              ))}
            </div>
          </section>

          <section className="detail-info-card">
            <h2>업종 제한</h2>
            <p className="detail-text-block">{listing.restrictions.join(", ")}</p>
          </section>

          <section className="detail-info-card">
            <h2>소개</h2>
            <p className="detail-text-block">{listing.description}</p>
          </section>

          {listing.hashtags.length > 0 ? (
            <div className="detail-hashtag-list">
              {listing.hashtags.map((tag) => (
                <span key={tag} className="detail-hashtag">
                  #{tag}
                </span>
              ))}
            </div>
          ) : null}

          <section className="detail-info-card">
            <h2>위치</h2>
            <DetailLocationMap listing={listing} appKey={appKey} />
          </section>
        </div>
      </div>
    </section>
  );
}

function DateField({ id, label, value, onChange, required = false }) {
  const inputRef = useRef(null);

  const openPicker = () => {
    if (!inputRef.current) {
      return;
    }

    if (typeof inputRef.current.showPicker === "function") {
      inputRef.current.showPicker();
      return;
    }

    inputRef.current.focus();
  };

  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__input-wrap">
        <input
          ref={inputRef}
          id={id}
          className="field__input field__input--date"
          type="date"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
        />
        <button
          className="field__icon-button"
          type="button"
          aria-label={`${label} 달력 열기`}
          onClick={openPicker}
        >
          <NavIcon type="calendar" />
        </button>
      </div>
    </div>
  );
}

function LoginPage({ onSubmit, onNavigateSignup }) {
  const [form, setForm] = useState({
    loginId: "",
    password: "",
    autoLogin: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");
    setIsSubmitting(true);

    try {
      await onSubmit(form);
    } catch (error) {
      setSubmitError(error.message || "로그인에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="login-page">
      <div className="login-shell">
        <div className="page-intro login-intro">
          <h1>로그인</h1>
          <p>콜팝에 다시 오신 것을 환영합니다</p>
        </div>

        <div className="login-card">
          <form className="login-form" onSubmit={handleSubmit}>
            <div className="field login-form__field">
              <label className="field__label" htmlFor="login-id">
                아이디
              </label>
              <input
                id="login-id"
                className="field__input"
                type="text"
                placeholder="아이디를 입력해주세요"
                value={form.loginId}
                onChange={(event) => updateField("loginId", event.target.value)}
                autoComplete="username"
                required
              />
            </div>

            <div className="field login-form__field">
              <label className="field__label" htmlFor="login-password">
                비밀번호
              </label>
              <div className="field__input-wrap login-password-field">
                <input
                  id="login-password"
                  className="field__input"
                  type={showPassword ? "text" : "password"}
                  placeholder="비밀번호를 입력해주세요"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  className="login-password-field__toggle"
                  type="button"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <NavIcon type={showPassword ? "eyeOff" : "eye"} />
                </button>
              </div>
            </div>

            <div className="login-form__meta">
              <label className="login-checkbox">
                <input
                  type="checkbox"
                  checked={form.autoLogin}
                  onChange={(event) => updateField("autoLogin", event.target.checked)}
                />
                <span className="login-checkbox__box" aria-hidden="true" />
                <span>자동 로그인</span>
              </label>
            </div>

            {submitError ? <p className="signup-form__error">{submitError}</p> : null}

            <button className="submit-button login-form__submit" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "로그인 중..." : "로그인"}
            </button>
          </form>
        </div>

        <p className="login-signup-copy">
          아직 계정이 없으신가요?
          <button type="button" onClick={onNavigateSignup}>
            회원가입
          </button>
        </p>
      </div>
    </section>
  );
}

function SignupPage({ onNavigateLogin, onSubmit, onCheckLoginId, onSendPhoneCode, onVerifyPhoneCode }) {
  const [form, setForm] = useState({
    username: "",
    name: "",
    password: "",
    passwordConfirm: "",
    phone: "",
    email: "",
  });
  const [submitError, setSubmitError] = useState("");
  const [usernameCheck, setUsernameCheck] = useState({
    status: "idle",
    message: "",
    checkedValue: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [phoneVerification, setPhoneVerification] = useState({
    status: "idle",
    message: "",
    code: "",
  });
  const [pendingAction, setPendingAction] = useState("");
  const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/;
  const isPasswordFormatValid = passwordPattern.test(form.password);
  const isPasswordConfirmTouched = form.passwordConfirm.length > 0;
  const isPasswordMatched = form.password.length > 0 && form.password === form.passwordConfirm;
  const isUsernameVerified =
    usernameCheck.status === "success" &&
    usernameCheck.checkedValue === normalizeUsername(form.username);
  const isPhoneVerified = phoneVerification.status === "verified";
  const canSubmitSignup =
    isUsernameVerified &&
    isPasswordFormatValid &&
    isPasswordMatched &&
    isPhoneVerified &&
    pendingAction !== "signup";

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: field === "phone" ? formatPhoneNumber(value) : value,
    }));

    if (field === "username") {
      setUsernameCheck({
        status: "idle",
        message: "",
        checkedValue: "",
      });
    }

    if (field === "phone") {
      setPhoneVerification({
        status: "idle",
        message: "",
        code: "",
      });
    }
  };

  const handleUsernameCheck = async () => {
    const normalizedUsername = normalizeUsername(form.username);
    const isValidFormat = /^[a-zA-Z0-9]{4,20}$/.test(form.username.trim());

    if (!isValidFormat) {
      setUsernameCheck({
        status: "error",
        message: "아이디는 영문, 숫자 조합 4~20자로 입력해주세요.",
        checkedValue: "",
      });
      return;
    }

    setPendingAction("check-id");

    try {
      await onCheckLoginId(normalizedUsername);
    } catch (error) {
      setUsernameCheck({
        status: "error",
        message: error.message || "이미 사용 중인 아이디입니다.",
        checkedValue: normalizedUsername,
      });
      setPendingAction("");
      return;
    }

    setUsernameCheck({
      status: "success",
      message: "사용 가능한 아이디입니다.",
      checkedValue: normalizedUsername,
    });
    setPendingAction("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!isUsernameVerified) {
      setSubmitError("아이디 중복 확인을 먼저 진행해주세요.");
      return;
    }

    if (!isPasswordFormatValid) {
      setSubmitError("비밀번호는 8자 이상, 영문+숫자+특수문자를 포함해야 합니다.");
      return;
    }

    if (!isPasswordMatched) {
      setSubmitError("비밀번호와 비밀번호 확인이 일치하지 않습니다.");
      return;
    }

    if (!isPhoneVerified) {
      setSubmitError("휴대폰 인증을 완료해주세요.");
      return;
    }

    setSubmitError("");
    setPendingAction("signup");

    try {
      await onSubmit(form);
    } catch (error) {
      setSubmitError(error.message || "회원가입에 실패했습니다.");
      setPendingAction("");
    }
  };

  const handleSendPhoneCode = async () => {
    const isValidPhoneNumber = /^010-\d{4}-\d{4}$/.test(form.phone.trim());

    if (!isValidPhoneNumber) {
      setPhoneVerification({
        status: "error",
        message: "휴대폰 번호를 정확히 입력해주세요.",
        code: "",
      });
      return;
    }

    setSubmitError("");
    setPendingAction("send-code");

    try {
      await onSendPhoneCode(form.phone.trim());
      setPhoneVerification((current) => ({
        status: "sent",
        message:
          current.status === "sent" || current.status === "verified"
            ? "인증번호를 다시 전송했습니다."
            : "인증번호를 전송했습니다.",
        code: "",
      }));
    } catch (error) {
      setPhoneVerification({
        status: "error",
        message: error.message || "인증번호 전송에 실패했습니다.",
        code: "",
      });
    } finally {
      setPendingAction("");
    }
  };

  const handleVerifyPhoneCode = async () => {
    if (phoneVerification.code.trim().length !== 6) {
      setPhoneVerification((current) => ({
        ...current,
        status: "error",
        message: "인증번호 6자리를 입력해주세요.",
      }));
      return;
    }

    setSubmitError("");
    setPendingAction("verify-code");

    try {
      await onVerifyPhoneCode({
        phone: form.phone.trim(),
        code: phoneVerification.code.trim(),
      });
      setPhoneVerification((current) => ({
        ...current,
        status: "verified",
        message: "휴대폰 인증이 완료되었습니다.",
      }));
    } catch (error) {
      setPhoneVerification((current) => ({
        ...current,
        status: "error",
        message: error.message || "인증번호가 올바르지 않습니다.",
      }));
    } finally {
      setPendingAction("");
    }
  };

  return (
    <section className="login-page signup-page">
      <div className="signup-shell">
        <div className="page-intro signup-intro">
          <h1>회원가입</h1>
          <p>콜팝에 오신 것을 환영합니다</p>
        </div>

        <form className="signup-form" onSubmit={handleSubmit}>
          <section className="signup-card">
            <div className="signup-card__header">
              <span className="signup-card__icon" aria-hidden="true">
                <NavIcon type="user" />
              </span>
              <h2>기본 정보</h2>
            </div>

            <div className="field signup-form__field">
              <label className="field__label" htmlFor="signup-username">
                아이디
              </label>
              <div className="signup-inline-field">
                <input
                  id="signup-username"
                  className="field__input"
                  type="text"
                  placeholder="영문, 숫자 4~20자"
                  value={form.username}
                  onChange={(event) => updateField("username", event.target.value)}
                  autoComplete="username"
                  required
                />
                <button
                  className="signup-inline-field__button is-check"
                  type="button"
                  onClick={handleUsernameCheck}
                  disabled={pendingAction === "check-id"}
                >
                  {pendingAction === "check-id" ? "확인 중" : "중복 확인"}
                </button>
              </div>
              {usernameCheck.message ? (
                <p className={`signup-form__message is-${usernameCheck.status}`}>{usernameCheck.message}</p>
              ) : null}
            </div>

            <div className="field signup-form__field">
              <label className="field__label" htmlFor="signup-name">
                이름
              </label>
              <input
                id="signup-name"
                className="field__input"
                type="text"
                placeholder="실명을 입력해주세요"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
                autoComplete="name"
                required
              />
            </div>

            <div className="field signup-form__field">
              <label className="field__label" htmlFor="signup-password">
                비밀번호
              </label>
              <div className="field__input-wrap login-password-field">
                <input
                  id="signup-password"
                  className="field__input"
                  type={showPassword ? "text" : "password"}
                  placeholder="8자 이상, 영문+숫자+특수문자 조합"
                  value={form.password}
                  onChange={(event) => updateField("password", event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  className="login-password-field__toggle"
                  type="button"
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword((current) => !current)}
                >
                  <NavIcon type={showPassword ? "eyeOff" : "eye"} />
                </button>
              </div>
              {form.password.length > 0 ? (
                <p className={`signup-form__message is-${isPasswordFormatValid ? "success" : "error"}`}>
                  {isPasswordFormatValid
                    ? "사용 가능한 비밀번호입니다."
                    : "8자 이상, 영문+숫자+특수문자를 포함해주세요."}
                </p>
              ) : null}
            </div>

            <div className="field signup-form__field">
              <label className="field__label" htmlFor="signup-password-confirm">
                비밀번호 확인
              </label>
              <div className="field__input-wrap login-password-field">
                <input
                  id="signup-password-confirm"
                  className="field__input"
                  type={showPasswordConfirm ? "text" : "password"}
                  placeholder="비밀번호를 다시 입력해주세요"
                  value={form.passwordConfirm}
                  onChange={(event) => updateField("passwordConfirm", event.target.value)}
                  autoComplete="new-password"
                  required
                />
                <button
                  className="login-password-field__toggle"
                  type="button"
                  aria-label={showPasswordConfirm ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"}
                  aria-pressed={showPasswordConfirm}
                  onClick={() => setShowPasswordConfirm((current) => !current)}
                >
                  <NavIcon type={showPasswordConfirm ? "eyeOff" : "eye"} />
                </button>
              </div>
              {isPasswordConfirmTouched ? (
                <p className={`signup-form__message is-${isPasswordMatched ? "success" : "error"}`}>
                  {isPasswordMatched ? "비밀번호가 일치합니다." : "비밀번호가 일치하지 않습니다."}
                </p>
              ) : null}
            </div>
          </section>

          <section className="signup-card">
            <div className="signup-card__header">
              <span className="signup-card__icon" aria-hidden="true">
                <NavIcon type="phone" />
              </span>
              <h2>연락처</h2>
            </div>

            <div className="field signup-form__field">
              <label className="field__label" htmlFor="signup-phone">
                휴대폰 번호
              </label>
              <div className="signup-inline-field">
                <input
                  id="signup-phone"
                  className="field__input"
                  type="tel"
                  inputMode="numeric"
                  placeholder="010-0000-0000"
                  value={form.phone}
                  onChange={(event) => updateField("phone", event.target.value)}
                  autoComplete="tel"
                  required
                />
                <button
                  className="signup-inline-field__button"
                  type="button"
                  onClick={handleSendPhoneCode}
                  disabled={pendingAction === "send-code"}
                >
                  {pendingAction === "send-code"
                    ? "전송 중"
                    : phoneVerification.status === "sent" || phoneVerification.status === "verified"
                      ? "재전송"
                      : "인증번호 전송"}
                </button>
              </div>
              {phoneVerification.message ? (
                <p
                  className={`signup-form__message is-${
                    phoneVerification.status === "verified"
                      ? "success"
                      : phoneVerification.status === "error"
                        ? "error"
                        : "info"
                  }`}
                >
                  {phoneVerification.message}
                </p>
              ) : null}
              {phoneVerification.status === "sent" || phoneVerification.status === "verified" ? (
                <div className="signup-form__verification">
                  <label className="field__label" htmlFor="signup-phone-verification">
                    인증번호
                  </label>
                  <div className="signup-inline-field">
                    <input
                      id="signup-phone-verification"
                      className="field__input"
                      type="text"
                      inputMode="numeric"
                      placeholder="인증번호 6자리를 입력해주세요"
                      value={phoneVerification.code}
                      onChange={(event) =>
                        setPhoneVerification((current) => ({
                          ...current,
                          code: sanitizeNumericInput(event.target.value).slice(0, 6),
                          status:
                            current.status === "verified" ? "verified" : current.status === "error" ? "sent" : current.status,
                          message:
                            current.status === "error"
                              ? "인증번호를 전송했습니다."
                              : current.message,
                        }))
                      }
                      disabled={phoneVerification.status === "verified"}
                      required
                    />
                    <button
                      className={`signup-inline-field__button is-check ${phoneVerification.status === "verified" ? "is-complete" : ""}`}
                      type="button"
                      onClick={handleVerifyPhoneCode}
                      disabled={phoneVerification.status === "verified" || pendingAction === "verify-code"}
                    >
                      {pendingAction === "verify-code"
                        ? "확인 중"
                        : phoneVerification.status === "verified"
                          ? "인증 완료"
                          : "인증 확인"}
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="field signup-form__field">
              <label className="field__label" htmlFor="signup-email">
                이메일 <span className="signup-form__optional">선택</span>
              </label>
              <input
                id="signup-email"
                className="field__input"
                type="email"
                placeholder="example@email.com"
                value={form.email}
                onChange={(event) => updateField("email", event.target.value)}
                autoComplete="email"
              />
            </div>
          </section>

          {submitError ? <p className="signup-form__error">{submitError}</p> : null}

          <button className="submit-button signup-form__submit" type="submit" disabled={!canSubmitSignup}>
            {pendingAction === "signup" ? "가입 중..." : "회원가입"}
          </button>

          <p className="login-signup-copy signup-login-copy">
            이미 계정이 있으신가요?
            <button type="button" onClick={onNavigateLogin}>
              로그인
            </button>
          </p>
        </form>
      </div>
    </section>
  );
}

function RegistrationMapPreview({ appKey, lat, lng, onOpenMap }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const [mapLoading, setMapLoading] = useState(false);
  const [mapError, setMapError] = useState("");
  const hasCoords = lat.trim().length > 0 && lng.trim().length > 0;

  useEffect(() => {
    if (!hasCoords) {
      setMapLoading(false);
      setMapError("");
      return;
    }

    let cancelled = false;
    setMapLoading(true);
    setMapError("");

    loadKakaoMapsSdk(appKey)
      .then((kakao) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        const position = new kakao.maps.LatLng(Number(lat), Number(lng));

        if (!mapRef.current) {
          const map = new kakao.maps.Map(containerRef.current, {
            center: position,
            level: 3,
            draggable: false,
            scrollwheel: false,
            keyboardShortcuts: false,
          });

          const marker = new kakao.maps.Marker({
            position,
          });

          marker.setMap(map);
          mapRef.current = map;
          markerRef.current = marker;
        } else {
          mapRef.current.relayout();
          mapRef.current.setCenter(position);
          markerRef.current?.setPosition(position);
        }

        setMapLoading(false);
        setMapError("");
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setMapLoading(false);
        setMapError(error.message || getKakaoMapErrorMessage());
      });

    return () => {
      cancelled = true;
    };
  }, [appKey, hasCoords, lat, lng]);

  const placeholderMessage = !hasCoords
    ? "주소를 검색하면 위치가 지도에 표시됩니다."
    : mapError || (mapLoading ? "지도를 불러오는 중입니다." : "");

  return (
    <div className="registration-map">
      <div className="registration-map__frame">
        <div
          ref={containerRef}
          className={`registration-map__canvas ${!hasCoords || mapError ? "is-hidden" : ""}`}
          aria-label="선택한 주소 지도 미리보기"
        />
        {placeholderMessage ? (
          <div className="registration-map__placeholder">
            <p>{placeholderMessage}</p>
          </div>
        ) : null}
        <button className="registration-map__action" type="button" disabled={!hasCoords} onClick={onOpenMap}>
          지도에서 열기
          <NavIcon type="external" />
        </button>
      </div>
    </div>
  );
}

function StepperField({
  id,
  value,
  placeholder,
  required = false,
  onChange,
  onStep,
}) {
  return (
    <div className="field__stepper">
      <input
        id={id}
        className="field__input"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(sanitizeNumericInput(event.target.value))}
        onKeyDown={(event) => {
          if (event.key === "ArrowUp") {
            event.preventDefault();
            onStep(1);
          }

          if (event.key === "ArrowDown") {
            event.preventDefault();
            onStep(-1);
          }
        }}
        required={required}
      />
      <div className="field__stepper-controls" aria-hidden="true">
        <button className="field__stepper-button" type="button" tabIndex={-1} onClick={() => onStep(1)}>
          +
        </button>
        <button className="field__stepper-button" type="button" tabIndex={-1} onClick={() => onStep(-1)}>
          -
        </button>
      </div>
    </div>
  );
}

function HomePage({ listings, appKey, onOpenDetail, onFetchListingsForDiscovery }) {
  const [query, setQuery] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [activeListingId, setActiveListingId] = useState(listings[0]?.id ?? null);
  const [mapListingMessage, setMapListingMessage] = useState("");
  const loadedInitialListingsRef = useRef(false);

  useEffect(() => {
    if (!onFetchListingsForDiscovery || loadedInitialListingsRef.current) {
      return;
    }

    loadedInitialListingsRef.current = true;
    onFetchListingsForDiscovery().catch((error) => {
      setMapListingMessage(error.message || "매물 정보를 불러오지 못했습니다.");
    });
  }, [onFetchListingsForDiscovery]);

  useEffect(() => {
    if (listings.some((listing) => listing.id === activeListingId)) {
      return;
    }

    setActiveListingId(listings[0]?.id ?? null);
  }, [activeListingId, listings]);

  const matchesPanelFilter = (listing) => {
    const keyword = query.trim().toLowerCase();
    const matchesQuery = keyword.length === 0 || [listing.title, listing.address].join(" ").toLowerCase().includes(keyword);

    return matchesQuery;
  };

  const panelFilteredListings = listings.filter(matchesPanelFilter);
  const visibleListings = panelFilteredListings;

  const handleBoundsChange = () => {};

  useEffect(() => {
    if (panelFilteredListings.some((listing) => listing.id === activeListingId)) {
      return;
    }

    setActiveListingId(panelFilteredListings[0]?.id ?? null);
  }, [activeListingId, panelFilteredListings]);

  const { mapReady, mapMessage, mapRef, focusListings, panToListing, searchLocation, resetMapBounds } = useKakaoMap({
    appKey,
    listings,
    activeListingId,
    panelFilter: matchesPanelFilter,
    onVisibleIdsChange: () => {},
    onBoundsChange: handleBoundsChange,
    onSelectListing: (listingId) => {
      setActiveListingId(listingId);
    },
    onOpenListing: onOpenDetail,
  });

  useEffect(() => {
    if (!mapReady || panelFilteredListings.length === 0) {
      return;
    }

    focusListings(panelFilteredListings);
  }, [focusListings, listings.length, mapReady, query]);

  const handleSearchSubmit = async (event) => {
    event.preventDefault();
    setSearchMessage("");

    const normalizedQuery = query.trim();

    if (!normalizedQuery) {
      if (mapReady) {
        resetMapBounds();
      }
      return;
    }

    if (!mapReady) {
      setSearchMessage(mapMessage || "지도를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    if (panelFilteredListings.length > 0) {
      setActiveListingId(panelFilteredListings[0].id);
      focusListings(panelFilteredListings);

      if (panelFilteredListings.length === 1) {
        panToListing(panelFilteredListings[0].id);
      }

      return;
    }

    try {
      await searchLocation(normalizedQuery);
    } catch (error) {
      setSearchMessage(error.message || "검색한 위치로 이동하지 못했습니다.");
    }
  };

  const selectListing = (listingId, withPan = false) => {
    setActiveListingId(listingId);

    if (withPan) {
      panToListing(listingId);
    }
  };

  return (
    <>
      <section className="hero">
        <div className="hero__inner">
          <div className="hero__copy">
            <p className="eyebrow">멈춰있던 공간, 다시 움직이는 거리</p>
            <h1>빈 점포와 새로운 기회를 연결해 지역에 활기를 더합니다</h1>
          </div>

          <form className="search-panel" role="search" onSubmit={handleSearchSubmit}>
            <label className="sr-only" htmlFor="listing-search">
              지역, 주소, 건물명, 상권, 지하철역 검색
            </label>
            <input
              id="listing-search"
              name="query"
              type="search"
              placeholder="지역, 주소, 건물명, 상권, 지하철역"
              autoComplete="off"
              value={query}
              aria-describedby={searchMessage ? "listing-search-message" : undefined}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchMessage("");
              }}
            />
            <button type="submit" aria-label="검색">
              <NavIcon type="search" />
            </button>
          </form>
          {searchMessage && (
            <p id="listing-search-message" className="search-panel__message" role="status">
              {searchMessage}
            </p>
          )}

          <div className={`map-preview ${mapReady ? "" : "is-fallback"}`}>
            <div className="map-preview__toolbar">
              <button className="map-preview__action" type="button" disabled={!mapReady} onClick={resetMapBounds}>
                {mapReady ? "전체 범위 보기" : "지도 준비 중"}
              </button>
            </div>
            <div ref={mapRef} id="map" aria-label="매물 지도" />
            {!mapReady && (
              <div className="map-preview__placeholder">
                <strong>카카오맵 준비 중</strong>
                <p>{mapMessage}</p>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="listing-section">
        <div className="section-heading">
          <div>
            <h2>
              주변 매물 <span>{visibleListings.length.toLocaleString("ko-KR")}</span>건
            </h2>
            <p>
              {mapListingMessage ||
                (mapReady
                  ? "검색어에 맞는 매물을 지도와 목록에 함께 표시합니다"
                  : "카카오맵 키와 서비스 설정이 완료되면 지도 범위와 리스트가 실시간으로 연동됩니다")}
            </p>
          </div>
        </div>

        {visibleListings.length > 0 ? (
          <div className="listing-grid" aria-live="polite">
            {visibleListings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                active={listing.id === activeListingId}
                onSelect={selectListing}
                onOpenDetail={onOpenDetail}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>조건에 맞는 매물이 없어요. 다른 검색어로 다시 찾아보세요.</p>
          </div>
        )}
      </section>
    </>
  );
}

function ReservationCard({ reservation, onApprove, onReject, onOpenChat }) {
  const statusMeta = reservationStatusMeta[reservation.status] ?? reservationStatusMeta.pending;

  return (
    <article className="reservation-card">
      <div className="reservation-card__content">
        <div className="reservation-card__title-row">
          <h2>{reservation.listingTitle}</h2>
          <span className={`reservation-badge ${statusMeta.className}`}>
            <span className="reservation-badge__dot" />
            {reservation.statusLabel || statusMeta.label}
          </span>
        </div>

        <div className="reservation-card__meta">
          <span>신청자: {reservation.applicant}</span>
          <span>{reservation.period}</span>
          <span>{reservation.appliedAt} 신청</span>
        </div>

        <p className="reservation-card__message">{reservation.message}</p>
      </div>

      <div className={`reservation-card__actions ${reservation.status === "rejected" ? "is-muted" : ""}`}>
        {reservation.canApprove || reservation.canReject ? (
          <>
            {reservation.canApprove ? (
              <button className="reservation-action reservation-action--approve" type="button" onClick={() => onApprove(reservation.id)}>
                승인
              </button>
            ) : null}
            {reservation.canReject ? (
              <button className="reservation-action reservation-action--ghost" type="button" onClick={() => onReject(reservation.id)}>
                거절
              </button>
            ) : null}
          </>
        ) : null}

        {reservation.canChat ? (
          <button className="reservation-action reservation-action--chat" type="button" onClick={() => onOpenChat(reservation)}>
            <NavIcon type="chat" />
            <span>채팅</span>
          </button>
        ) : null}

        {reservation.status === "rejected" ? <span className="reservation-card__muted-label">처리 완료</span> : null}
      </div>
    </article>
  );
}

function ChatPage({
  threads,
  activeThreadId,
  currentUserId,
  isLoading,
  errorMessage,
  onSelectThread,
  onSendMessage,
  onReceiveMessage,
  onSocketError,
  onCompleteDeal,
}) {
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? threads[0] ?? null;
  const [draftMessage, setDraftMessage] = useState("");
  const imageInputRef = useRef(null);
  const messageEndRef = useRef(null);
  const socketRef = useRef(null);
  const reconnectTimerRef = useRef(null);

  useEffect(() => {
    setDraftMessage("");
  }, [activeThreadId]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ block: "end" });
  }, [activeThreadId, activeThread?.messages.length]);

  useEffect(() => {
    if (!activeThread?.id) {
      window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
      return undefined;
    }

    let shouldReconnect = true;
    const roomId = Number(activeThread.id);
    socketRef.current?.close();
    socketRef.current = null;

    const connectSocket = () => {
      window.clearTimeout(reconnectTimerRef.current);

      try {
        socketRef.current = createChatSocket({
          roomId,
          onOpen: () => {
            onSocketError("");
          },
          onMessage: (payload) => {
            const nextMessage = normalizeSocketMessage(payload, currentUserId, roomId);

            if (!nextMessage || (nextMessage.roomId && nextMessage.roomId !== roomId)) {
              return;
            }

            onReceiveMessage(roomId, nextMessage);
          },
          onError: (error) => {
            onSocketError(error.message);
          },
          onClose: () => {
            if (!shouldReconnect) {
              return;
            }

            reconnectTimerRef.current = window.setTimeout(connectSocket, 1000);
          },
        });
      } catch (error) {
        onSocketError(error.message || "채팅 소켓을 연결하지 못했습니다.");

        if (shouldReconnect) {
          reconnectTimerRef.current = window.setTimeout(connectSocket, 1000);
        }
      }
    };

    connectSocket();

    return () => {
      shouldReconnect = false;
      window.clearTimeout(reconnectTimerRef.current);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [activeThread?.id, currentUserId, onReceiveMessage, onSocketError]);

  const handleSubmit = (event) => {
    event.preventDefault();

    const trimmedMessage = draftMessage.trim();

    if (!activeThread || trimmedMessage.length === 0) {
      return;
    }

    try {
      sendChatSocketMessage(socketRef.current, {
        roomId: activeThread.id,
        content: trimmedMessage,
      });
    } catch (error) {
      onSocketError(error.message || "메시지를 보내지 못했습니다.");
      return;
    }

    onSendMessage(activeThread.id, trimmedMessage);
    setDraftMessage("");
  };

  const handleImageChange = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!activeThread || !file || !file.type.startsWith("image/")) {
      return;
    }

    const imageSrc = await readFileAsDataUrl(file);

    onSendMessage(activeThread.id, {
      imageSrc,
      fileName: file.name,
    });
  };

  return (
    <section className="chat-page">
      <div className="chat-layout">
        <aside className="chat-sidebar">
          <div className="chat-sidebar__intro">
            <h1>채팅</h1>
            <p>{isLoading ? "대화방을 불러오는 중입니다" : `${threads.length}개의 대화방`}</p>
          </div>

          {errorMessage ? <p className="signup-form__error">{errorMessage}</p> : null}

          <div className="chat-thread-list" role="list" aria-label="대화방 목록">
            {threads.map((thread) => {
              const isActive = thread.id === activeThread?.id;

              return (
                <button
                  key={thread.id}
                  className={`chat-thread-card ${isActive ? "is-active" : ""}`}
                  type="button"
                  onClick={() => onSelectThread(thread.id)}
                >
                  <div className="chat-thread-card__body">
                    <div className="chat-thread-card__top">
                      <strong>{thread.name}</strong>
                      <span>{thread.timestamp}</span>
                    </div>
                    <p className="chat-thread-card__listing">{thread.listingTitle}</p>
                    <p className="chat-thread-card__preview">{thread.preview}</p>
                  </div>

                  {thread.unreadCount > 0 ? <span className="chat-thread-card__badge">{thread.unreadCount}</span> : null}
                </button>
              );
            })}
          </div>
        </aside>

        <div className="chat-panel">
          {activeThread ? (
            <>
              <header className="chat-panel__header">
                <div className="chat-panel__header-main">
                  <div className="chat-panel__header-copy">
                    <strong>{activeThread.name}</strong>
                    <span>{activeThread.listingTitle}</span>
                  </div>
                </div>
                <button
                  className={`chat-panel__deal-button ${activeThread.dealClosed ? "is-complete" : ""}`}
                  type="button"
                  onClick={() => onCompleteDeal(activeThread.id)}
                  disabled={activeThread.dealClosed}
                >
                  {activeThread.dealClosed ? "거래 완료" : "거래 성사"}
                </button>
              </header>

              <div className="chat-panel__messages">
                {activeThread.messages.map((message) => (
                  <div
                    key={message.id}
                    className={`chat-message ${message.sender === "host" ? "is-outgoing" : "is-incoming"} ${message.imageSrc ? "has-image" : ""}`}
                  >
                    {message.imageSrc ? (
                      <img
                        className="chat-message__image"
                        src={message.imageSrc}
                        alt={message.fileName ?? "전송한 이미지"}
                      />
                    ) : null}
                    {message.text ? <span className="chat-message__text">{message.text}</span> : null}
                  </div>
                ))}
                {activeThread.messages.length === 0 ? (
                  <div className="empty-state">
                    <p>아직 메시지가 없습니다.</p>
                  </div>
                ) : null}
                <div ref={messageEndRef} />
              </div>

              <form className="chat-composer" onSubmit={handleSubmit}>
                <input
                  ref={imageInputRef}
                  className="sr-only"
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                />
                <button
                  className="chat-composer__attach"
                  type="button"
                  aria-label="이미지 첨부"
                  onClick={() => imageInputRef.current?.click()}
                >
                  <NavIcon type="image" />
                </button>
                <input
                  className="chat-composer__input"
                  type="text"
                  placeholder="메시지를 입력하세요"
                  value={draftMessage}
                  onChange={(event) => setDraftMessage(event.target.value)}
                />
                <button
                  className="chat-composer__send"
                  type="submit"
                  aria-label="메시지 보내기"
                  disabled={draftMessage.trim().length === 0}
                >
                  <NavIcon type="send" />
                </button>
              </form>
            </>
          ) : (
            <div className="empty-state">
              <p>대화방을 선택하면 메시지를 볼 수 있어요.</p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ReservationPage({ reservations, summary, isLoading, errorMessage, onApproveReservation, onRejectReservation, onOpenChat }) {
  const pendingCount = summary?.pendingCount ?? reservations.filter((reservation) => reservation.status === "pending").length;
  const approvedCount = summary?.approvedCount ?? reservations.filter((reservation) => reservation.status === "approved").length;
  const totalCount = summary?.totalCount ?? reservations.length;

  const handleApprove = (reservationId) => onApproveReservation(reservationId);
  const handleReject = (reservationId) => onRejectReservation(reservationId);

  return (
    <section className="reservation-page">
      <div className="reservation-shell">
        <div className="page-intro reservation-intro">
          <h1>예약 관리</h1>
          {isLoading ? <p>예약을 불러오는 중입니다</p> : null}
        </div>

        {errorMessage ? <p className="signup-form__error">{errorMessage}</p> : null}

        <div className="reservation-summary-grid" aria-label="예약 요약">
          <article className="reservation-summary-card">
            <span className="reservation-summary-card__label">승인 대기</span>
            <strong className="reservation-summary-card__value">{pendingCount}</strong>
          </article>
          <article className="reservation-summary-card">
            <span className="reservation-summary-card__label">승인 완료</span>
            <strong className="reservation-summary-card__value is-approved">{approvedCount}</strong>
          </article>
          <article className="reservation-summary-card">
            <span className="reservation-summary-card__label">전체 예약</span>
            <strong className="reservation-summary-card__value is-total">{totalCount}</strong>
          </article>
        </div>

        {reservations.length > 0 ? (
          <div className="reservation-list">
            {reservations.map((reservation) => (
              <ReservationCard
                key={reservation.id}
                reservation={reservation}
                onApprove={handleApprove}
                onReject={handleReject}
                onOpenChat={onOpenChat}
              />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <p>들어온 예약이 아직 없어요.</p>
          </div>
        )}
      </div>
    </section>
  );
}

function RegistrationPage({ onSubmitListing, appKey, editingListing }) {
  const fileInputRef = useRef(null);
  const detailAddressRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [photoPreviews, setPhotoPreviews] = useState([]);
  const [addressNotice, setAddressNotice] = useState("");
  const [isAddressLoading, setIsAddressLoading] = useState(false);
  const [imageError, setImageError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState(createInitialRegistrationForm);
  const isEditing = Boolean(editingListing);

  useEffect(() => {
    if (editingListing) {
      const editingImages =
        editingListing.gallery?.length > 0
          ? editingListing.gallery
          : editingListing.image
            ? [editingListing.image]
            : [];

      setForm(createRegistrationFormFromListing(editingListing));
      setPhotoPreviews(
        editingImages.map((image, index) => ({
          name: `${editingListing.title || "매물 사진"} ${index + 1}`,
          src: image,
          url: image,
        })),
      );
    } else {
      setForm(createInitialRegistrationForm());
      setPhotoPreviews([]);
    }

    setDragging(false);
    setAddressNotice("");
    setIsAddressLoading(false);
    setImageError("");
    setSubmitError("");
    setIsSubmitting(false);
  }, [editingListing]);

  const updateField = (field, value) => {
    setForm((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const stepMoneyField = (field, step, direction) => {
    setForm((current) => ({
      ...current,
      [field]: getSteppedValue(current[field], step, direction),
    }));
  };

  const toggleFacility = (facility) => {
    setForm((current) => ({
      ...current,
      facilities: current.facilities.includes(facility)
        ? current.facilities.filter((item) => item !== facility)
        : [...current.facilities, facility],
    }));
  };

  const toggleRestriction = (restriction) => {
    setForm((current) => {
      if (restriction === "없음") {
        return {
          ...current,
          restrictions: ["없음"],
        };
      }

      const nextRestrictions = current.restrictions.filter((item) => item !== "없음");
      const hasRestriction = nextRestrictions.includes(restriction);
      const updatedRestrictions = hasRestriction
        ? nextRestrictions.filter((item) => item !== restriction)
        : [...nextRestrictions, restriction];

      return {
        ...current,
        restrictions: updatedRestrictions.length > 0 ? updatedRestrictions : ["없음"],
      };
    });
  };

  const addCustomFacility = () => {
    setForm((current) => {
      const entries = parseCustomEntries(current.facilityDraft);

      if (entries.length === 0) {
        return current;
      }

      const nextFacilities = [...current.facilities];
      const nextCustomFacilities = [...current.customFacilities];

      entries.forEach((entry) => {
        if (facilityOptions.includes(entry)) {
          if (!nextFacilities.includes(entry)) {
            nextFacilities.push(entry);
          }

          return;
        }

        if (!nextCustomFacilities.includes(entry)) {
          nextCustomFacilities.push(entry);
        }
      });

      return {
        ...current,
        facilities: nextFacilities,
        customFacilities: nextCustomFacilities,
        facilityDraft: "",
      };
    });
  };

  const removeCustomFacility = (facility) => {
    setForm((current) => ({
      ...current,
      customFacilities: current.customFacilities.filter((item) => item !== facility),
    }));
  };

  const addCustomRestriction = () => {
    setForm((current) => {
      const entries = parseCustomEntries(current.restrictionDraft);

      if (entries.length === 0) {
        return current;
      }

      const nextRestrictions = current.restrictions.filter((item) => item !== "없음");
      const nextCustomRestrictions = [...current.customRestrictions];

      entries.forEach((entry) => {
        if (entry === "없음") {
          return;
        }

        if (restrictionOptions.includes(entry)) {
          if (!nextRestrictions.includes(entry)) {
            nextRestrictions.push(entry);
          }

          return;
        }

        if (!nextCustomRestrictions.includes(entry)) {
          nextCustomRestrictions.push(entry);
        }
      });

      return {
        ...current,
        restrictions:
          nextRestrictions.length > 0 || nextCustomRestrictions.length > 0
            ? nextRestrictions
            : ["없음"],
        customRestrictions: nextCustomRestrictions,
        restrictionDraft: "",
      };
    });
  };

  const removeCustomRestriction = (restriction) => {
    setForm((current) => {
      const nextCustomRestrictions = current.customRestrictions.filter((item) => item !== restriction);
      const hasPresetRestriction = current.restrictions.some((item) => item !== "없음");

      return {
        ...current,
        restrictions: hasPresetRestriction || nextCustomRestrictions.length > 0 ? current.restrictions : ["없음"],
        customRestrictions: nextCustomRestrictions,
      };
    });
  };

  const handleCustomDraftKeyDown = (event, onAdd) => {
    if (event.key !== "Enter") {
      return;
    }

    event.preventDefault();
    onAdd();
  };

  const appendFiles = async (fileList) => {
    const remainingCount = Math.max(0, 10 - photoPreviews.length);
    const files = Array.from(fileList);
    const invalidTypeCount = files.filter((file) => !file.type.startsWith("image/")).length;
    const emptyFileCount = files.filter((file) => file.type.startsWith("image/") && file.size <= 0).length;
    const validFiles = files
      .filter((file) => file.type.startsWith("image/") && file.size > 0)
      .slice(0, remainingCount);

    if (emptyFileCount > 0) {
      setImageError("빈 이미지 파일은 업로드할 수 없습니다.");
    } else if (invalidTypeCount > 0) {
      setImageError("JPG 또는 PNG 이미지 파일만 업로드할 수 있습니다.");
    } else if (files.length > remainingCount) {
      setImageError("이미지는 최대 10장까지 업로드할 수 있습니다.");
    } else {
      setImageError("");
    }

    if (validFiles.length === 0) {
      return;
    }

    const previewCandidates = await Promise.all(
      validFiles.map(async (file) => ({
        name: file.name,
        file,
        src: await readFileAsDataUrl(file),
      })),
    );

    setPhotoPreviews((current) => [...current, ...previewCandidates].slice(0, 10));
  };

  const removePhotoPreview = (index) => {
    setPhotoPreviews((current) => current.filter((_, currentIndex) => currentIndex !== index));
    setImageError("");
  };

  const handleFileChange = async (event) => {
    if (!event.target.files) {
      return;
    }

    await appendFiles(event.target.files);
    event.target.value = "";
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    setDragging(false);

    if (event.dataTransfer.files.length > 0) {
      await appendFiles(event.dataTransfer.files);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const baseAddress = form.address.trim();
    const detailAddress = form.detailAddress.trim();
    const address = [baseAddress, detailAddress].filter(Boolean).join(" ");
    const customFacilities = Array.from(
      new Set([...form.customFacilities, ...parseCustomEntries(form.facilityDraft)]),
    );
    const customRestrictions = Array.from(
      new Set([...form.customRestrictions, ...parseCustomEntries(form.restrictionDraft).filter((item) => item !== "없음")]),
    );
    const nextFacilities = Array.from(new Set([...form.facilities, ...customFacilities]));
    const nextRestrictions = Array.from(
      new Set([
        ...form.restrictions.filter((item) => item !== "없음"),
        ...customRestrictions,
      ]),
    );

    const industryRestrictions = form.restrictions.filter((item) => item !== "없음");
    const listingDraft = {
      title: form.title.trim(),
      category: editingListing?.category ?? "기타",
      address,
      baseAddress,
      detailAddress,
      price: Number(form.price) || 0,
      deposit: Number(form.deposit) || 0,
      area: `${form.area || 0}㎡`,
      views: editingListing?.views ?? 0,
      image: photoPreviews[0]?.src ?? editingListing?.image ?? "",
      gallery:
        photoPreviews.length > 0
          ? photoPreviews.map((preview) => preview.src)
          : editingListing?.gallery ?? [],
      imagePreviews: photoPreviews,
      status: editingListing?.status ?? "모집중",
      favorite: editingListing?.favorite ?? false,
      quickAdded: editingListing?.quickAdded ?? false,
      lat: Number(form.lat) || 37.5665,
      lng: Number(form.lng) || 126.978,
      facilities: nextFacilities,
      industryRestrictions,
      additionalRestrictions: customRestrictions,
      restrictions: nextRestrictions.length > 0 ? nextRestrictions : ["없음"],
      availableFrom: form.availableFrom.trim(),
      availableTo: form.availableTo.trim(),
      minDays: form.minDays.trim(),
      maxDays: form.maxDays.trim(),
      description: form.description.trim(),
      hashtags: parseHashtags(form.hashtags),
      ownedByMe: editingListing?.ownedByMe ?? true,
    };

    setSubmitError("");
    setIsSubmitting(true);

    try {
      await onSubmitListing(listingDraft);
    } catch (error) {
      setSubmitError(error.message || "매물 저장에 실패했습니다.");
      setIsSubmitting(false);
    }
  };

  const handleAddressSearch = async () => {
    setAddressNotice("");
    setIsAddressLoading(true);

    try {
      await loadKakaoPostcodeSdk();
      const Postcode = window.kakao?.Postcode ?? window.daum?.Postcode;

      if (!Postcode) {
        throw new Error("주소 검색 서비스를 불러오지 못했습니다.");
      }

      setIsAddressLoading(false);

      new Postcode({
        oncomplete: async (data) => {
          const selectedAddress =
            data.userSelectedType === "R" ? data.roadAddress : data.jibunAddress;
          const displayAddress = buildSelectedAddress(data);

          setIsAddressLoading(true);

          try {
            const coordinates = await geocodeAddress(appKey, selectedAddress);

            setForm((current) => ({
              ...current,
              address: displayAddress,
              lat: coordinates.lat,
              lng: coordinates.lng,
            }));
            setAddressNotice("");
          } catch (error) {
            setForm((current) => ({
              ...current,
              address: displayAddress,
              lat: "",
              lng: "",
            }));
            setAddressNotice(
              error.message ||
                "주소는 선택됐지만 좌표를 불러오지 못했어요. 카카오 지도 설정을 확인해 주세요.",
            );
          } finally {
            setIsAddressLoading(false);
            requestAnimationFrame(() => detailAddressRef.current?.focus());
          }
        },
      }).open();
    } catch {
      setIsAddressLoading(false);
      setAddressNotice("주소 검색창을 불러오지 못했어요. 네트워크 연결을 확인해 주세요.");
    }
  };

  const handleOpenMap = () => {
    if (!form.lat || !form.lng) {
      return;
    }

    const label = encodeURIComponent(form.address || "선택한 위치");
    const url = `https://map.kakao.com/link/map/${label},${form.lat},${form.lng}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <section className="registration-page">
      <div className="registration-shell">
        <div className="page-intro">
          <h1>{isEditing ? "매물 수정" : "매물 등록"}</h1>
          <p>
            {isEditing
              ? "등록한 매물 정보를 최신 상태로 업데이트하세요"
              : "빈 점포 정보를 입력하고 창업자들에게 알려보세요"}
          </p>
        </div>

        <form className="registration-card" onSubmit={handleSubmit}>
          <section className="registration-section">
            <h2>기본 정보</h2>

            <div className="field">
              <label className="field__label" htmlFor="listing-photo">
                대표 사진 & 추가 사진
              </label>
              <div
                className={`upload-dropzone ${dragging ? "is-dragging" : ""} ${photoPreviews.length > 0 ? "has-previews" : ""}`}
                onClick={() => fileInputRef.current?.click()}
                onDragEnter={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={(event) => {
                  event.preventDefault();
                  setDragging(false);
                }}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  id="listing-photo"
                  className="sr-only"
                  type="file"
                  accept="image/png, image/jpeg"
                  multiple
                  onChange={handleFileChange}
                />

                {photoPreviews.length > 0 ? (
                  <>
                    <div className="upload-preview-grid">
                      {photoPreviews.map((preview, index) => (
                        <div key={`${preview.name}-${preview.src}`} className="upload-preview">
                          <img src={preview.src} alt={preview.name} />
                          <button
                            className="upload-preview__remove"
                            type="button"
                            aria-label={`${preview.name} 삭제`}
                            onClick={(event) => {
                              event.stopPropagation();
                              removePhotoPreview(index);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className="upload-dropzone__footnote">
                      사진을 추가로 업로드하려면 다시 클릭하거나 파일을 끌어다 놓으세요.
                    </div>
                  </>
                ) : (
                  <div className="upload-dropzone__placeholder">
                    <span className="upload-dropzone__icon">
                      <NavIcon type="camera" />
                    </span>
                    <strong>사진을 끌어다 놓거나 클릭해서 업로드</strong>
                    <span>최대 10장, JPG/PNG</span>
                  </div>
                )}
              </div>
              {imageError ? <p className="signup-form__error upload-dropzone__error">{imageError}</p> : null}
            </div>

            <div className="field">
              <label className="field__label" htmlFor="listing-title">
                매물명 *
              </label>
              <input
                id="listing-title"
                className="field__input"
                type="text"
                placeholder="예: 홍대입구역 1층 패션 팝업 공간"
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                required
              />
            </div>

            <div className="registration-address-layout">
              <div className="field field--address-main">
                <label className="field__label" htmlFor="listing-address">
                  주소 *
                </label>
                <div className="field__inline-action field__inline-action--address">
                  <input
                    id="listing-address"
                    className="field__input field__input--readonly field__input--soft"
                    type="text"
                    placeholder="주소 검색 버튼을 눌러 주소를 선택하세요"
                    value={form.address}
                    readOnly
                    onClick={handleAddressSearch}
                    required
                  />

                  <button
                    className="field__button field__button--search"
                    type="button"
                    disabled={isAddressLoading}
                    onClick={handleAddressSearch}
                  >
                    {isAddressLoading ? "불러오는 중" : "주소 검색"}
                  </button>
                </div>
              </div>

              <div className="field field--address-detail">
                <label className="field__label" htmlFor="listing-detail-address">
                  상세주소
                </label>
                <input
                  id="listing-detail-address"
                  ref={detailAddressRef}
                  className="field__input field__input--soft"
                  type="text"
                  value={form.detailAddress}
                  onChange={(event) => updateField("detailAddress", event.target.value)}
                  placeholder="예: 1층"
                />
                <p className="field__helper">층수, 호수, 매장 위치를 간단히 입력해 주세요.</p>
              </div>
            </div>

            {addressNotice ? <p className="field__notice">{addressNotice}</p> : null}

            <div className="registration-grid registration-grid--two registration-grid--geo">
              <div className="field">
                <label className="field__label" htmlFor="listing-lat">
                  위도
                </label>
                <input
                  id="listing-lat"
                  className="field__input"
                  type="text"
                  value={form.lat}
                  readOnly
                  placeholder="주소 선택 시 자동 입력"
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="listing-lng">
                  경도
                </label>
                <input
                  id="listing-lng"
                  className="field__input"
                  type="text"
                  value={form.lng}
                  readOnly
                  placeholder="주소 선택 시 자동 입력"
                />
              </div>
            </div>

            <div className="field">
              <span className="field__label">지도 미리보기</span>
              <RegistrationMapPreview appKey={appKey} lat={form.lat} lng={form.lng} onOpenMap={handleOpenMap} />
            </div>
          </section>

          <section className="registration-section">
            <h2>상세 정보</h2>

            <div className="registration-grid registration-grid--three">
              <div className="field">
                <label className="field__label" htmlFor="listing-price">
                  하루 이용료 (원) *
                </label>
                <StepperField
                  id="listing-price"
                  value={form.price}
                  onChange={(value) => updateField("price", value)}
                  onStep={(direction) => stepMoneyField("price", priceStep, direction)}
                  required
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="listing-deposit">
                  보증금 (원)
                </label>
                <StepperField
                  id="listing-deposit"
                  value={form.deposit}
                  onChange={(value) => updateField("deposit", value)}
                  onStep={(direction) => stepMoneyField("deposit", depositStep, direction)}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="listing-area">
                  면적 (m²) *
                </label>
                <input
                  id="listing-area"
                  className="field__input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={form.area}
                  onChange={(event) => updateField("area", event.target.value)}
                  required
                />
              </div>
            </div>

            <div className="field">
              <span className="field__label">시설</span>
              <div className="toggle-chip-set">
                {facilityOptions.map((facility) => (
                  <button
                    key={facility}
                    className={`toggle-chip ${form.facilities.includes(facility) ? "is-active" : ""}`}
                    type="button"
                    aria-pressed={form.facilities.includes(facility)}
                    onClick={() => toggleFacility(facility)}
                  >
                    {facility}
                  </button>
                ))}
              </div>
              <div className="field__custom-block">
                <div className="field__custom-head">
                  <p className="field__custom-guide">목록에 없는 시설도 직접 추가할 수 있어요.</p>
                  <span className="field__count-badge">{form.customFacilities.length}개 추가됨</span>
                </div>
                <div className="field__inline-action field__inline-action--custom">
                  <input
                    className="field__input"
                    type="text"
                    placeholder="예: 빔프로젝션, 탈의실, 음료바"
                    value={form.facilityDraft}
                    onChange={(event) => updateField("facilityDraft", event.target.value)}
                    onKeyDown={(event) => handleCustomDraftKeyDown(event, addCustomFacility)}
                  />
                  <button
                    className="field__action-button"
                    type="button"
                    onClick={addCustomFacility}
                    disabled={!form.facilityDraft.trim()}
                  >
                    추가
                  </button>
                </div>
                {form.customFacilities.length > 0 ? (
                  <div className="field-tag-list">
                    {form.customFacilities.map((facility) => (
                      <button
                        key={facility}
                        className="field-tag"
                        type="button"
                        onClick={() => removeCustomFacility(facility)}
                      >
                        <span>{facility}</span>
                        <span className="field-tag__remove" aria-hidden="true">
                          ×
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="field">
              <span className="field__label">업종 제한</span>
              <div className="toggle-chip-set">
                {restrictionOptions.map((restriction) => (
                  <button
                    key={restriction}
                    className={`toggle-chip ${form.restrictions.includes(restriction) ? "is-active" : ""}`}
                    type="button"
                    aria-pressed={form.restrictions.includes(restriction)}
                    onClick={() => toggleRestriction(restriction)}
                  >
                    {restriction}
                  </button>
                ))}
              </div>
              <div className="field__custom-block">
                <div className="field__custom-head">
                  <p className="field__custom-guide">별도 제한사항을 직접 추가하고 태그처럼 관리할 수 있어요.</p>
                  <span className="field__count-badge">{form.customRestrictions.length}개 추가됨</span>
                </div>
                <div className="field__inline-action field__inline-action--custom">
                  <input
                    className="field__input"
                    type="text"
                    placeholder="예: 화기 사용 불가, 외부 간판 설치 불가"
                    value={form.restrictionDraft}
                    onChange={(event) => updateField("restrictionDraft", event.target.value)}
                    onKeyDown={(event) => handleCustomDraftKeyDown(event, addCustomRestriction)}
                  />
                  <button
                    className="field__action-button"
                    type="button"
                    onClick={addCustomRestriction}
                    disabled={!form.restrictionDraft.trim()}
                  >
                    추가
                  </button>
                </div>
                {form.customRestrictions.length > 0 ? (
                  <div className="field-tag-list">
                    {form.customRestrictions.map((restriction) => (
                      <button
                        key={restriction}
                        className="field-tag"
                        type="button"
                        onClick={() => removeCustomRestriction(restriction)}
                      >
                        <span>{restriction}</span>
                        <span className="field-tag__remove" aria-hidden="true">
                          ×
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="registration-grid registration-grid--two">
              <DateField
                id="listing-available-from"
                label="운영 가능 시작일 *"
                value={form.availableFrom}
                onChange={(value) => updateField("availableFrom", value)}
                required
              />

              <DateField
                id="listing-available-to"
                label="운영 가능 종료일 *"
                value={form.availableTo}
                onChange={(value) => updateField("availableTo", value)}
                required
              />
            </div>

            <div className="registration-grid registration-grid--two">
              <div className="field">
                <label className="field__label" htmlFor="listing-min-days">
                  최소 운영 일수
                </label>
                <input
                  id="listing-min-days"
                  className="field__input"
                  type="number"
                  min="1"
                  value={form.minDays}
                  onChange={(event) => updateField("minDays", event.target.value)}
                />
              </div>

              <div className="field">
                <label className="field__label" htmlFor="listing-max-days">
                  최대 운영 일수
                </label>
                <input
                  id="listing-max-days"
                  className="field__input"
                  type="number"
                  min="1"
                  value={form.maxDays}
                  onChange={(event) => updateField("maxDays", event.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="registration-section">
            <h2>소개</h2>

            <div className="field">
              <label className="field__label" htmlFor="listing-description">
                매물 소개글 *
              </label>
              <textarea
                id="listing-description"
                className="field__textarea"
                maxLength={500}
                placeholder="점포의 특징, 주변 상권, 교통편 등을 자세히 설명해주세요."
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                required
              />
              <div className="field__footer">
                <span>최대 500자</span>
                <span>{form.description.length}/500</span>
              </div>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="listing-hashtags">
                해시태그
              </label>
              <input
                id="listing-hashtags"
                className="field__input"
                type="text"
                placeholder="예: #홍대, #1층, #유동인구많음"
                value={form.hashtags}
                onChange={(event) => updateField("hashtags", event.target.value)}
              />
              <div className="field__footer">
                <span>쉼표 또는 띄어쓰기로 구분해 최대 8개까지 입력할 수 있어요.</span>
                <span>{parseHashtags(form.hashtags).length}/8</span>
              </div>
            </div>

            {submitError ? <p className="signup-form__error">{submitError}</p> : null}

            <button className="submit-button" type="submit" disabled={isSubmitting}>
              {isSubmitting ? "저장 중..." : isEditing ? "매물 수정하기" : "매물 등록하기"}
            </button>
          </section>
        </form>
      </div>
    </section>
  );
}

export default function App() {
  const savedAuthSession = getSavedAuthSession();
  const [currentPage, setCurrentPage] = useState("home");
  const [listings, setListings] = useState([]);
  const [reservations, setReservations] = useState([]);
  const [reservationSummary, setReservationSummary] = useState({
    pendingCount: 0,
    approvedCount: 0,
    totalCount: 0,
  });
  const [reservationState, setReservationState] = useState({
    loading: false,
    error: "",
  });
  const [chatThreads, setChatThreads] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [chatState, setChatState] = useState({
    loading: false,
    error: "",
  });
  const [profile, setProfile] = useState(() => ({
    ...myProfileSeed,
    name: savedAuthSession?.user?.name ?? myProfileSeed.name,
    phone: formatPhoneNumber(savedAuthSession?.user?.phone ?? myProfileSeed.phone),
  }));
  const [authSession, setAuthSession] = useState(() => savedAuthSession);
  const [pendingAuthPage, setPendingAuthPage] = useState(null);
  const [registeredUsernames, setRegisteredUsernames] = useState([]);
  const [editingListingId, setEditingListingId] = useState(null);
  const [selectedListingId, setSelectedListingId] = useState(null);
  const [detailReturnPage, setDetailReturnPage] = useState("home");
  const [detailState, setDetailState] = useState({
    loading: false,
    error: "",
  });
  const appKey = import.meta.env.VITE_KAKAO_MAP_APP_KEY ?? "";
  const editingListing = listings.find((listing) => listing.id === editingListingId) ?? null;
  const selectedListing = listings.find((listing) => listing.id === selectedListingId) ?? null;
  const isAuthenticated = Boolean(authSession?.accessToken);
  const currentUserId = authSession?.user?.userId ?? authSession?.user?.id ?? null;

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [currentPage]);

  useEffect(() => {
    const handleAuthUpdated = (event) => {
      if (event.detail) {
        setAuthSession(event.detail);
      }
    };
    const handleAuthExpired = () => {
      setAuthSession(null);
      setProfile(myProfileSeed);
      setPendingAuthPage(protectedPages.has(currentPage) ? currentPage : null);
      setEditingListingId(null);
      setSelectedListingId(null);
      setCurrentPage("login");
      window.alert("로그인이 만료되었습니다. 다시 로그인해주세요.");
    };

    window.addEventListener("kolpop:auth-updated", handleAuthUpdated);
    window.addEventListener("kolpop:auth-expired", handleAuthExpired);

    return () => {
      window.removeEventListener("kolpop:auth-updated", handleAuthUpdated);
      window.removeEventListener("kolpop:auth-expired", handleAuthExpired);
    };
  }, [currentPage]);

  useEffect(() => {
    if (currentPage !== "detail" || !selectedListingId) {
      return undefined;
    }

    let cancelled = false;
    const hasFallbackListing = Boolean(selectedListing);
    setDetailState({
      loading: !hasFallbackListing,
      error: "",
    });

    fetchListingDetail(selectedListingId)
      .then((detailListing) => {
        if (cancelled) {
          return;
        }

        setListings((current) => {
          const hasListing = current.some((listing) => listing.id === detailListing.id);

          if (!hasListing) {
            return [enrichListing(detailListing), ...current];
          }

          return current.map((listing) =>
            listing.id === detailListing.id
              ? enrichListing({
                  ...listing,
                  ...detailListing,
                  ownedByMe: listing.ownedByMe ?? false,
                })
              : listing,
          );
        });
        setDetailState({
          loading: false,
          error: "",
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setDetailState({
          loading: false,
          error: hasFallbackListing ? "" : error.message || "매물 상세 정보를 불러오지 못했습니다.",
        });
      });

    return () => {
      cancelled = true;
    };
  }, [currentPage, selectedListingId]);

  const updateListing = (listingId, updater) => {
    setListings((current) =>
      current.map((listing) => (listing.id === listingId ? updater(listing) : listing)),
    );
  };

  const loadListingsForDiscovery = async ({ bounds, keyword, sort } = {}) => {
    const data = await fetchListingsForDiscovery({ bounds, keyword, sort });

    setListings((current) => {
      const listingsById = new Map(current.map((listing) => [listing.id, listing]));
      const discoveryListingsById = new Map();

      data.map.listings.forEach((listing) => {
        discoveryListingsById.set(listing.id, listing);
      });

      data.nearbyListings.listings.forEach((listing) => {
        discoveryListingsById.set(listing.id, {
          ...discoveryListingsById.get(listing.id),
          ...listing,
        });
      });

      discoveryListingsById.forEach((listing) => {
        const previousListing = listingsById.get(listing.id);
        listingsById.set(
          listing.id,
          enrichListing({
            ...previousListing,
            ...listing,
            ownedByMe: previousListing?.ownedByMe ?? false,
          }),
        );
      });

      const ownedListings = current.filter((listing) => listing.ownedByMe);
      const discoveryListings = Array.from(discoveryListingsById.values()).map((listing) => {
        const previousListing = listingsById.get(listing.id);

        return enrichListing({
          ...previousListing,
          ...listing,
          ownedByMe: previousListing?.ownedByMe ?? false,
        });
      });

      return [...ownedListings, ...discoveryListings.filter((listing) => !listing.ownedByMe)];
    });

    return data;
  };

  const reloadMyListings = async () => {
    const data = await fetchMyListings();

    setListings((current) => {
      const nonOwnedListings = current.filter((listing) => !listing.ownedByMe);
      const ownedListings = data.listings.map((listing) => enrichListing(listing));
      return [...ownedListings, ...nonOwnedListings];
    });

    return data;
  };

  useEffect(() => {
    if (!isAuthenticated || currentPage !== "mypage") {
      return;
    }

    reloadMyListings().catch(() => {});
  }, [currentPage, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || currentPage !== "mypage") {
      return;
    }

    fetchMyPage()
      .then((nextProfile) => {
        setProfile((current) => ({
          ...current,
          ...nextProfile,
          phone: formatPhoneNumber(nextProfile.phone ?? current.phone),
        }));
      })
      .catch(() => {});
  }, [currentPage, isAuthenticated]);

  const saveListing = async (draft) => {
    const imageUrls = await resolveListingImageUrls(draft.imagePreviews);
    const payload = createListingPayload({
      ...draft,
      image: imageUrls[0] || "",
      gallery: imageUrls,
    });
    const syncedDraft = enrichListing({
      ...draft,
      image: imageUrls[0] || draft.image || "",
      gallery: imageUrls,
      ownedByMe: true,
    });
    const refreshMyListings = () => {
      reloadMyListings().catch((error) => {
        console.warn("Failed to refresh my listings after save.", error);
      });
    };

    if (editingListingId) {
      await updateListingRequest(editingListingId, payload);
      setListings((current) =>
        current.map((listing) =>
          listing.id === editingListingId
            ? {
                ...listing,
                ...syncedDraft,
                id: editingListingId,
              }
            : listing,
        ),
      );
      refreshMyListings();
      setEditingListingId(null);
      setCurrentPage("mypage");
      return;
    }

    const result = await createListing(payload);
    const createdListingId = Number(result?.listingId);

    if (Number.isFinite(createdListingId)) {
      setListings((current) => [
        {
          ...syncedDraft,
          id: createdListingId,
        },
        ...current.filter((listing) => listing.id !== createdListingId),
      ]);
    }

    refreshMyListings();

    if (Number.isFinite(createdListingId)) {
      setSelectedListingId(createdListingId);
      setDetailReturnPage("mypage");
      setCurrentPage("detail");
      return;
    }

    setCurrentPage("mypage");
  };

  const loadManagementReservations = async () => {
    setReservationState({
      loading: true,
      error: "",
    });

    try {
      const data = await fetchManagementReservations();
      setReservations(data.reservations);
      setReservationSummary(data.summary);
      setReservationState({
        loading: false,
        error: "",
      });
      return data;
    } catch (error) {
      setReservationState({
        loading: false,
        error: error.message || "예약 정보를 불러오지 못했습니다.",
      });
      return null;
    }
  };

  const applyReservationActionResult = (result) => {
    setReservations((current) =>
      current.map((reservation) =>
        reservation.id === result.reservationId
          ? {
              ...reservation,
              status: result.status,
              statusLabel: result.statusLabel,
              chatRoomId: result.chatRoomId ?? reservation.chatRoomId,
              canApprove: false,
              canReject: false,
              canChat: result.status === "approved" && Boolean(result.chatRoomId ?? reservation.chatRoomId),
            }
          : reservation,
      ),
    );
  };

  const approveReservation = async (reservationId) => {
    try {
      const result = await approveReservationRequest(reservationId);
      applyReservationActionResult(result);
      await loadManagementReservations();
    } catch (error) {
      window.alert(error.message || "예약 승인에 실패했습니다.");
    }
  };

  const rejectReservation = async (reservationId) => {
    try {
      const result = await rejectReservationRequest(reservationId);
      applyReservationActionResult(result);
      await loadManagementReservations();
    } catch (error) {
      window.alert(error.message || "예약 거절에 실패했습니다.");
    }
  };

  useEffect(() => {
    if (!isAuthenticated || currentPage !== "reservation") {
      return;
    }

    loadManagementReservations();
  }, [currentPage, isAuthenticated]);

  const loadChatRooms = async () => {
    setChatState({
      loading: true,
      error: "",
    });

    try {
      const rooms = await fetchChatRooms(currentUserId);
      setChatThreads((current) =>
        rooms.map((room) => {
          const previousRoom = current.find((thread) => thread.id === room.id);
          return previousRoom ? { ...room, messages: previousRoom.messages } : room;
        }),
      );
      setActiveChatId((current) => current ?? rooms[0]?.id ?? null);
      setChatState({
        loading: false,
        error: "",
      });
      return rooms;
    } catch (error) {
      setChatState({
        loading: false,
        error: error.message || "대화방을 불러오지 못했습니다.",
      });
      return [];
    }
  };

  const loadChatMessages = async (roomId) => {
    if (!roomId) {
      return;
    }

    try {
      const messages = await fetchChatMessages(roomId, currentUserId);
      setChatThreads((current) =>
        current.map((thread) =>
          thread.id === roomId
            ? {
                ...thread,
                messages,
                preview: messages.at(-1)?.text || thread.preview,
                timestamp: messages.at(-1)?.timestamp || thread.timestamp,
              }
            : thread,
        ),
      );
      setChatState((current) => ({
        ...current,
        error: "",
      }));
    } catch (error) {
      setChatState((current) => ({
        ...current,
        error: error.message || "메시지를 불러오지 못했습니다.",
      }));
    }
  };

  useEffect(() => {
    if (!isAuthenticated || currentPage !== "chat") {
      return;
    }

    loadChatRooms();
  }, [currentPage, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || currentPage !== "chat" || chatThreads.length === 0) {
      return;
    }

    if (chatThreads.some((thread) => thread.id === activeChatId)) {
      return;
    }

    setActiveChatId(chatThreads[0].id);
  }, [activeChatId, chatThreads, currentPage, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated || currentPage !== "chat" || !activeChatId) {
      return undefined;
    }

    const syncActiveMessages = () => {
      loadChatMessages(activeChatId);
    };

    syncActiveMessages();
    const intervalId = window.setInterval(syncActiveMessages, 2000);
    window.addEventListener("focus", syncActiveMessages);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", syncActiveMessages);
    };
  }, [activeChatId, currentPage, isAuthenticated]);

  const selectChatThread = (roomId) => {
    setActiveChatId(roomId);
    loadChatMessages(roomId);
  };

  const requestLoginForPage = (page) => {
    const shouldLogin = window.confirm("로그인이 필요한 서비스입니다. 로그인하시겠습니까?");

    if (shouldLogin) {
      setPendingAuthPage(page);
      setEditingListingId(null);
      setSelectedListingId(null);
      setCurrentPage("login");
    }

    return shouldLogin;
  };

  const ensureAuthenticated = (page) => {
    if (isAuthenticated || !protectedPages.has(page)) {
      return true;
    }

    requestLoginForPage(page);
    return false;
  };

  const openChatRoom = async (reservation) => {
    if (!ensureAuthenticated("chat")) {
      return;
    }

    if (reservation?.chatRoomId) {
      setActiveChatId(Number(reservation.chatRoomId));
      setCurrentPage("chat");
      await loadChatRooms();
      await loadChatMessages(Number(reservation.chatRoomId));
      return;
    }

    setCurrentPage("chat");
    await loadChatRooms();
  };

  const appendLocalChatMessage = (threadId, payload) => {
    setChatThreads((current) =>
      current.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }

        const messageDraft =
          typeof payload === "string"
            ? { text: payload }
            : payload;
        const nextMessageId =
          thread.messages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1;
        const nextPreview = messageDraft.imageSrc
          ? messageDraft.text || "사진을 보냈습니다."
          : messageDraft.text || thread.preview;

        return {
          ...thread,
          preview: nextPreview,
          timestamp: "방금",
          unreadCount: 0,
          messages: [
            ...thread.messages,
            {
              id: nextMessageId,
              sender: "host",
              text: messageDraft.text ?? "",
              imageSrc: messageDraft.imageSrc,
              fileName: messageDraft.fileName,
            },
          ],
        };
      }),
    );
  };

  const appendSocketChatMessage = useCallback((threadId, nextMessage) => {
    setChatThreads((current) =>
      current.map((thread) => {
        if (thread.id !== threadId) {
          return thread;
        }

        if (
          thread.messages.some((message) => message.id === nextMessage.id) ||
          thread.messages.some(
            (message) =>
              message.sender === nextMessage.sender &&
              message.text === nextMessage.text &&
              message.timestamp === "방금",
          )
        ) {
          return thread;
        }

        return {
          ...thread,
          preview: nextMessage.text || thread.preview,
          timestamp: nextMessage.timestamp || "방금",
          unreadCount: 0,
          messages: [...thread.messages, nextMessage],
        };
      }),
    );
  }, []);

  const updateChatSocketError = useCallback((message) => {
    setChatState((current) => ({
      ...current,
      error: message || "",
    }));
  }, []);

  const sendChatMessage = (threadId, payload) => {
    appendLocalChatMessage(threadId, payload);
  };

  const completeDeal = (threadId) => {
    const completedThread = chatThreads.find((thread) => thread.id === threadId);
    const matchedReservation = reservations.find(
      (reservation) =>
        reservation.applicant === completedThread?.name &&
        reservation.listingTitle === completedThread?.listingTitle,
    );

    if (!completedThread || completedThread.dealClosed) {
      return;
    }

    setChatThreads((current) =>
      current.map((thread) => {
        if (thread.id !== threadId || thread.dealClosed) {
          return thread;
        }

        const nextMessageId =
          thread.messages.reduce((maxId, message) => Math.max(maxId, message.id), 0) + 1;

        return {
          ...thread,
          dealClosed: true,
          preview: matchedReservation
            ? `${matchedReservation.period} 일정 거래가 성사되었습니다.`
            : "해당 일정 거래가 성사되었습니다.",
          timestamp: "방금",
          unreadCount: 0,
          messages: [
            ...thread.messages,
            {
              id: nextMessageId,
              sender: "host",
              text: matchedReservation
                ? `${matchedReservation.period} 일정이 거래 성사되어 해당 기간만 예약 마감했습니다.`
                : "거래가 성사되어 해당 기간만 예약 마감했습니다.",
            },
          ],
        };
      }),
    );

    if (matchedReservation) {
      setReservations((current) =>
        current.map((reservation) =>
          reservation.id === matchedReservation.id
            ? {
                ...reservation,
                status: "approved",
              }
            : reservation,
        ),
      );
    }
  };

  const deleteListing = async (listingId) => {
    if (!window.confirm("매물을 삭제하시겠습니까?")) {
      return;
    }

    try {
      await deleteListingRequest(listingId);
      setListings((current) => current.filter((listing) => listing.id !== listingId));
    } catch (error) {
      window.alert(error.message || "매물 삭제에 실패했습니다.");
    }
  };

  const closeRecruitment = async (listingId) => {
    try {
      const result = await closeListingRequest(listingId);
      const nextStatus = result?.status?.label || "모집 종료";

      setListings((current) =>
        current.map((listing) =>
          listing.id === listingId
            ? {
                ...listing,
                status: nextStatus,
              }
            : listing,
        ),
      );
    } catch (error) {
      window.alert(error.message || "모집 종료에 실패했습니다.");
    }
  };

  const handlePrimaryNavigation = (page) => {
    if (!ensureAuthenticated(page)) {
      return;
    }

    if (!protectedPages.has(page)) {
      setPendingAuthPage(null);
    }

    setEditingListingId(null);
    setSelectedListingId(null);
    setCurrentPage(page);
  };

  const openCreateListingPage = () => {
    if (!ensureAuthenticated("register")) {
      return;
    }

    setEditingListingId(null);
    setSelectedListingId(null);
    setCurrentPage("register");
  };

  const openListingEditPage = (listingId) => {
    if (!ensureAuthenticated("register")) {
      return;
    }

    setEditingListingId(listingId);
    setSelectedListingId(null);
    setCurrentPage("register");
  };

  const openListingDetailPage = (listingId, returnPage = "home") => {
    setDetailState({
      loading: false,
      error: "",
    });
    setSelectedListingId(listingId);
    setDetailReturnPage(returnPage);
    setCurrentPage("detail");
  };

  const applyAuthSession = (session) => {
    saveAuthSession(session);
    setAuthSession(session);
    setProfile((current) => ({
      ...current,
      name: session.user?.name ?? current.name,
      phone: formatPhoneNumber(session.user?.phone ?? current.phone),
    }));
  };

  const handleLogin = async (form) => {
    const session = await loginLandlord({
      loginId: form.loginId.trim(),
      password: form.password,
    });

    applyAuthSession(session);
    setEditingListingId(null);
    setSelectedListingId(null);
    setCurrentPage(pendingAuthPage ?? "mypage");
    setPendingAuthPage(null);
  };

  const handleSignup = async (form) => {
    const normalizedUsername = normalizeUsername(form.username);
    const session = await signupLandlord({
      loginId: normalizedUsername,
      name: form.name.trim(),
      password: form.password,
      passwordConfirm: form.passwordConfirm,
      phone: form.phone.trim(),
      email: form.email.trim(),
    });

    setProfile((current) => ({
      ...current,
      name: form.name.trim() || current.name,
      phone: formatPhoneNumber(form.phone) || current.phone,
      email: form.email.trim(),
    }));
    applyAuthSession(session);
    setRegisteredUsernames((current) =>
      current.includes(normalizedUsername) ? current : [...current, normalizedUsername],
    );
    setSelectedListingId(null);
    setCurrentPage(pendingAuthPage ?? "mypage");
    setPendingAuthPage(null);
  };

  const handleLogout = () => {
    clearAuthSession();
    setAuthSession(null);
    setProfile(myProfileSeed);
    setPendingAuthPage(null);
    setEditingListingId(null);
    setSelectedListingId(null);
    setCurrentPage("home");
  };

  const handleUpdateProfile = async (nextProfile) => {
    const updatedProfile = await updateMyPage({
      name: nextProfile.name?.trim() ?? "",
      email: nextProfile.email?.trim() ?? "",
      phone: formatPhoneNumber(nextProfile.phone ?? ""),
      bio: nextProfile.bio?.trim() ?? "",
    });

    setProfile((current) => ({
      ...current,
      ...updatedProfile,
      phone: formatPhoneNumber(updatedProfile.phone ?? current.phone),
    }));
  };

  let pageContent = null;

  if (currentPage === "home") {
    pageContent = (
      <HomePage
        listings={listings}
        appKey={appKey}
        onOpenDetail={openListingDetailPage}
        onFetchListingsForDiscovery={loadListingsForDiscovery}
      />
    );
  } else if (currentPage === "login") {
    pageContent = <LoginPage onSubmit={handleLogin} onNavigateSignup={() => setCurrentPage("signup")} />;
  } else if (currentPage === "signup") {
    pageContent = (
      <SignupPage
        onNavigateLogin={() => setCurrentPage("login")}
        onSubmit={handleSignup}
        onCheckLoginId={(loginId) => {
          if (registeredUsernames.includes(loginId)) {
            return Promise.reject(new Error("이미 사용 중인 아이디입니다."));
          }

          return checkLoginId(loginId);
        }}
        onSendPhoneCode={sendSignupCode}
        onVerifyPhoneCode={verifySignupCode}
      />
    );
  } else if (currentPage === "reservation") {
    pageContent = (
      <ReservationPage
        reservations={reservations}
        summary={reservationSummary}
        isLoading={reservationState.loading}
        errorMessage={reservationState.error}
        onApproveReservation={approveReservation}
        onRejectReservation={rejectReservation}
        onOpenChat={openChatRoom}
      />
    );
  } else if (currentPage === "chat") {
    pageContent = (
      <ChatPage
        threads={chatThreads}
        activeThreadId={activeChatId}
        currentUserId={currentUserId}
        isLoading={chatState.loading}
        errorMessage={chatState.error}
        onSelectThread={selectChatThread}
        onSendMessage={sendChatMessage}
        onReceiveMessage={appendSocketChatMessage}
        onSocketError={updateChatSocketError}
        onCompleteDeal={completeDeal}
      />
    );
  } else if (currentPage === "detail" && selectedListing) {
    pageContent = (
      <ListingDetailPage
        listing={selectedListing}
        profile={profile}
        reservationCount={
          selectedListing.reservationCount ||
          reservations.filter((reservation) => reservation.listingTitle === selectedListing.title).length ||
          myListingReservationCounts[selectedListing.id] ||
          0
        }
        isLoading={detailState.loading}
        errorMessage={detailState.error}
        appKey={appKey}
        onBack={() => {
          setSelectedListingId(null);
          setDetailState({
            loading: false,
            error: "",
          });
          setCurrentPage(detailReturnPage);
        }}
      />
    );
  } else if (currentPage === "detail") {
    pageContent = <HomePage listings={listings} appKey={appKey} onOpenDetail={openListingDetailPage} />;
  } else if (currentPage === "mypage") {
    pageContent = (
      <MyPage
        profile={profile}
        listings={listings}
        onCreateListing={openCreateListingPage}
        onEditListing={openListingEditPage}
        onDeleteListing={deleteListing}
        onCloseRecruitment={closeRecruitment}
        onOpenDetail={(listingId) => openListingDetailPage(listingId, "mypage")}
        onUpdateProfile={handleUpdateProfile}
      />
    );
  } else {
    pageContent = (
      <RegistrationPage
        onSubmitListing={saveListing}
        appKey={appKey}
        editingListing={editingListing}
      />
    );
  }

  return (
    <>
      <SiteHeader
        currentPage={currentPage}
        isAuthenticated={isAuthenticated}
        onNavigate={handlePrimaryNavigation}
        onLogout={handleLogout}
      />

      <main>{pageContent}</main>
    </>
  );
}
