Rails.application.routes.draw do
  get "up" => "rails/health#show", as: :rails_health_check

  namespace :api do
    namespace :v1 do
      post "ingest", to: "ingest#create"
      get "categories", to: "saves#categories"
      get "platform_syncs", to: "saves#platform_syncs"
      resources :saves, only: [ :index, :update ] do
        get :thumbnail, on: :member
      end
    end
  end
end
