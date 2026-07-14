import { useCallback, useEffect, useRef, useState } from "react";
import {
  getKakaoMapErrorMessage,
  getNoAppKeyMessage,
  loadKakaoMapsSdk,
} from "../lib/kakao.js";

const DEFAULT_MAP_MESSAGE = "카카오맵을 불러오는 중입니다.";
const INIT_ERROR_MESSAGE =
  "카카오맵을 초기화하지 못했습니다. JavaScript 키와 허용 도메인을 확인해 주세요.";

const MAP_CENTER = {
  lat: 37.5352,
  lng: 126.9895,
};

const REGION_PRESETS = [
  { aliases: ["서울", "서울시", "서울특별시"], lat: 37.5665, lng: 126.978, level: 8 },
  { aliases: ["부산", "부산시", "부산광역시"], lat: 35.1796, lng: 129.0756, level: 8 },
  { aliases: ["대구", "대구시", "대구광역시"], lat: 35.8714, lng: 128.6014, level: 8 },
  { aliases: ["인천", "인천시", "인천광역시"], lat: 37.4563, lng: 126.7052, level: 8 },
  { aliases: ["광주", "광주시", "광주광역시"], lat: 35.1595, lng: 126.8526, level: 8 },
  { aliases: ["대전", "대전시", "대전광역시"], lat: 36.3504, lng: 127.3845, level: 8 },
  { aliases: ["울산", "울산시", "울산광역시"], lat: 35.5384, lng: 129.3114, level: 8 },
  { aliases: ["세종", "세종시", "세종특별자치시"], lat: 36.48, lng: 127.289, level: 8 },
  { aliases: ["경기", "경기도"], lat: 37.4138, lng: 127.5183, level: 10 },
  { aliases: ["강원", "강원도", "강원특별자치도"], lat: 37.8228, lng: 128.1555, level: 10 },
  { aliases: ["충북", "충청북도"], lat: 36.6357, lng: 127.4914, level: 10 },
  { aliases: ["충남", "충청남도"], lat: 36.6588, lng: 126.6728, level: 10 },
  { aliases: ["전북", "전라북도", "전북특별자치도"], lat: 35.8203, lng: 127.1088, level: 10 },
  { aliases: ["전남", "전라남도"], lat: 34.8161, lng: 126.4629, level: 10 },
  { aliases: ["경북", "경상북도"], lat: 36.4919, lng: 128.8889, level: 10 },
  { aliases: ["경남", "경상남도"], lat: 35.4606, lng: 128.2132, level: 10 },
  { aliases: ["제주", "제주도", "제주특별자치도"], lat: 33.4996, lng: 126.5312, level: 9 },
];

const normalizeLocationKeyword = (value) => value.replace(/\s+/g, "").toLowerCase();

const findRegionPreset = (keyword) => {
  const normalizedKeyword = normalizeLocationKeyword(keyword);

  return REGION_PRESETS.find((region) =>
    region.aliases.some((alias) => normalizeLocationKeyword(alias) === normalizedKeyword),
  );
};

const getAddressSearchLevel = (keyword) => {
  const normalizedKeyword = keyword.trim();

  if (/(특별시|광역시|특별자치시|특별자치도|도)$/.test(normalizedKeyword)) {
    return 10;
  }

  if (/(시|군|구)$/.test(normalizedKeyword)) {
    return 7;
  }

  return 5;
};

const createLatLng = (kakaoMaps, { lat, lng }) => new kakaoMaps.maps.LatLng(lat, lng);

const createOverlayElement = (listing, onSelect) => {
  const element = document.createElement("button");
  element.type = "button";
  element.className = "map-price-pin";
  element.setAttribute("aria-label", `${listing.title} 지도 핀`);
  element.innerHTML = `
    <span class="map-price-pin__amount">${Math.round(listing.deposit / 10000).toLocaleString("ko-KR")}만 / ${Math.round(listing.price / 10000).toLocaleString("ko-KR")}만</span>
    <span class="map-price-pin__caption">보증 / 일</span>
  `;
  element.addEventListener("click", () => onSelect(listing.id));
  return element;
};

export function useKakaoMap({
  appKey,
  listings,
  activeListingId,
  panelFilter,
  onVisibleIdsChange,
  onSelectListing,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const overlaysRef = useRef(new Map());
  const idleHandlerRef = useRef(null);
  const latestRef = useRef({
    listings,
    activeListingId,
    panelFilter,
    onVisibleIdsChange,
    onSelectListing,
  });

  const [mapReady, setMapReady] = useState(false);
  const [mapMessage, setMapMessage] = useState(
    appKey ? DEFAULT_MAP_MESSAGE : getNoAppKeyMessage(),
  );

  latestRef.current = {
    listings,
    activeListingId,
    panelFilter,
    onVisibleIdsChange,
    onSelectListing,
  };

  const syncVisibleIds = () => {
    if (!mapRef.current || !window.kakao?.maps) {
      latestRef.current.onVisibleIdsChange(null);
      return;
    }

    const bounds = mapRef.current.getBounds();
    const nextIds = latestRef.current.listings
      .filter(
        (listing) =>
          latestRef.current.panelFilter(listing) &&
          bounds.contain(createLatLng(window.kakao, listing)),
      )
      .map((listing) => listing.id);

    latestRef.current.onVisibleIdsChange(nextIds);
  };

  const syncOverlays = () => {
    overlaysRef.current.forEach(({ overlay, element }, listingId) => {
      const listing = latestRef.current.listings.find((item) => item.id === listingId);

      if (!listing) {
        overlay.setMap(null);
        return;
      }

      overlay.setVisible(latestRef.current.panelFilter(listing));
      element.classList.toggle("is-active", latestRef.current.activeListingId === listingId);
    });
  };

  const fitMapToListings = useCallback((targetListings) => {
    if (!mapRef.current || !window.kakao?.maps || targetListings.length === 0) {
      return;
    }

    const bounds = new window.kakao.maps.LatLngBounds();

    targetListings.forEach((listing) => {
      bounds.extend(createLatLng(window.kakao, listing));
    });

    mapRef.current.setBounds(bounds, 80, 80, 80, 80);
  }, []);

  const panToListing = useCallback((listingId) => {
    if (!mapRef.current || !window.kakao?.maps) {
      return;
    }

    const listing = latestRef.current.listings.find((item) => item.id === listingId);

    if (!listing) {
      return;
    }

    mapRef.current.panTo(createLatLng(window.kakao, listing));
  }, []);

  const searchLocation = useCallback(async (keyword) => {
    const normalizedKeyword = keyword.trim();
    const kakao = window.kakao;

    if (!normalizedKeyword) {
      throw new Error("검색어를 입력해 주세요.");
    }

    if (!mapRef.current || !kakao?.maps?.services) {
      throw new Error("카카오맵 검색 서비스를 준비하고 있습니다. 잠시 후 다시 시도해 주세요.");
    }

    const moveMap = ({ lat, lng, level }) => {
      mapRef.current.setLevel(level);
      mapRef.current.panTo(createLatLng(kakao, { lat, lng }));
    };

    const regionPreset = findRegionPreset(normalizedKeyword);

    if (regionPreset) {
      moveMap(regionPreset);
      return { ...regionPreset, source: "region" };
    }

    const geocoder = new kakao.maps.services.Geocoder();
    const addressResult = await new Promise((resolve) => {
      geocoder.addressSearch(normalizedKeyword, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result?.[0]) {
          resolve(result[0]);
          return;
        }

        resolve(null);
      });
    });

    if (addressResult) {
      const location = {
        lat: Number(addressResult.y),
        lng: Number(addressResult.x),
        level: getAddressSearchLevel(normalizedKeyword),
      };
      moveMap(location);
      return { ...location, source: "address" };
    }

    const places = new kakao.maps.services.Places();
    const placeResult = await new Promise((resolve) => {
      places.keywordSearch(normalizedKeyword, (result, status) => {
        if (status === kakao.maps.services.Status.OK && result?.[0]) {
          resolve(result[0]);
          return;
        }

        resolve(null);
      });
    });

    if (!placeResult) {
      throw new Error(`“${normalizedKeyword}”의 위치를 찾지 못했습니다.`);
    }

    const location = {
      lat: Number(placeResult.y),
      lng: Number(placeResult.x),
      level: 5,
    };
    moveMap(location);
    return { ...location, source: "place" };
  }, []);

  useEffect(() => {
    if (!mapReady) {
      return;
    }

    syncOverlays();
    syncVisibleIds();
  }, [mapReady, listings, activeListingId, panelFilter]);

  useEffect(() => {
    if (!appKey) {
      setMapReady(false);
      setMapMessage(getNoAppKeyMessage());
      latestRef.current.onVisibleIdsChange(null);
      return undefined;
    }

    let cancelled = false;
    setMapMessage(DEFAULT_MAP_MESSAGE);

    loadKakaoMapsSdk(appKey)
      .then((kakao) => {
        if (cancelled || !containerRef.current || mapRef.current) {
          return;
        }

        try {
          const map = new kakao.maps.Map(containerRef.current, {
            center: createLatLng(kakao, MAP_CENTER),
            level: 8,
            draggable: true,
            scrollwheel: true,
            keyboardShortcuts: false,
          });

          map.setMinLevel(4);
          map.setMaxLevel(12);

          const zoomControl = new kakao.maps.ZoomControl();
          map.addControl(zoomControl, kakao.maps.ControlPosition.RIGHT);

          latestRef.current.listings.forEach((listing) => {
            const element = createOverlayElement(listing, latestRef.current.onSelectListing);
            const overlay = new kakao.maps.CustomOverlay({
              position: createLatLng(kakao, listing),
              content: element,
              yAnchor: 1,
            });

            overlay.setMap(map);
            overlaysRef.current.set(listing.id, { overlay, element });
          });

          mapRef.current = map;

          idleHandlerRef.current = () => {
            syncVisibleIds();
          };

          kakao.maps.event.addListener(map, "idle", idleHandlerRef.current);

          setMapReady(true);
          setMapMessage("");
          syncOverlays();
          fitMapToListings(latestRef.current.listings.filter(latestRef.current.panelFilter));
        } catch {
          setMapReady(false);
          setMapMessage(INIT_ERROR_MESSAGE);
          latestRef.current.onVisibleIdsChange(null);
        }
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setMapReady(false);
        setMapMessage(error.message || getKakaoMapErrorMessage());
        latestRef.current.onVisibleIdsChange(null);
      });

    return () => {
      cancelled = true;

      if (mapRef.current && idleHandlerRef.current && window.kakao?.maps) {
        window.kakao.maps.event.removeListener(mapRef.current, "idle", idleHandlerRef.current);
      }
    };
  }, [appKey]);

  const focusListings = useCallback(
    (targetListings) => {
      fitMapToListings(targetListings);
    },
    [fitMapToListings],
  );

  const resetMapBounds = useCallback(() => {
    focusListings(latestRef.current.listings.filter(latestRef.current.panelFilter));
  }, [focusListings]);

  return {
    mapReady,
    mapMessage,
    mapRef: containerRef,
    focusListings,
    panToListing,
    searchLocation,
    resetMapBounds,
  };
}
